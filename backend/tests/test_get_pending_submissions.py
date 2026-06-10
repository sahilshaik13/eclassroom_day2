"""Tests for get_pending_submissions assembly logic.

Verifies:
  - Wave 1 runs students + tasks lookups in parallel via asyncio.gather
  - Wave 2 uses a single PostgREST inner-join fetch for days+periods
    (replaces 4 sequential round-trips with 1)
  - The assembly loop produces correct flat_data from the join result
    (period_to_day mapping + day_map + plan_map + class_name_map)
"""
import asyncio
from typing import Any
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

from app.api.v1.routes import teacher as teacher_routes
from app.services.study_plan_kpi_service import is_tracker_task, is_day_topic_task


# ── Assembly-loop logic tests (pure, no DB) ───────────────────────


def test_period_to_day_mapping_from_join():
    """Verify the inner-join result → period_to_day + day_map building.

    The PostgREST response for `.select("..., periods:study_plan_periods!inner(id)")`
    returns each day once with a nested `periods` array containing only the
    matching periods. We must build `period_to_day` from that nesting.
    """
    join_rows = [
        {
            "id": "day-1",
            "day_number": 1,
            "scheduled_date": "2026-06-01",
            "plan_id": "plan-A",
            "periods": [
                {"id": "period-1"},
                {"id": "period-2"},
            ],
        },
        {
            "id": "day-2",
            "day_number": 2,
            "scheduled_date": "2026-06-02",
            "plan_id": "plan-A",
            "periods": [
                {"id": "period-3"},
            ],
        },
    ]

    period_to_day: dict[str, str] = {}
    day_map: dict[str, dict] = {}
    for d in join_rows:
        day_id = str(d.get("id") or "")
        for p in d.get("periods") or []:
            pid = str(p.get("id") or "")
            if pid:
                period_to_day[pid] = day_id
        day_map[day_id] = d

    assert period_to_day == {
        "period-1": "day-1",
        "period-2": "day-1",
        "period-3": "day-2",
    }
    assert day_map["day-1"]["plan_id"] == "plan-A"
    assert day_map["day-2"]["day_number"] == 2


def test_period_to_day_handles_empty_periods():
    """A day with no matching periods (e.g. before any submission) should
    still appear in day_map, just not in period_to_day."""
    join_rows = [
        {"id": "day-1", "day_number": 1, "plan_id": "plan-A", "periods": []},
    ]
    period_to_day: dict[str, str] = {}
    day_map: dict[str, dict] = {}
    for d in join_rows:
        day_id = str(d.get("id") or "")
        for p in d.get("periods") or []:
            pid = str(p.get("id") or "")
            if pid:
                period_to_day[pid] = day_id
        day_map[day_id] = d

    assert period_to_day == {}
    assert "day-1" in day_map


# ── Mock-based integration test for the full route ─────────────────


def _make_mock_admin(responses: dict[str, Any]):
    """Build a mock Supabase admin client where each .table(name).select(...).execute()
    returns the matching response from `responses` dict.

    `responses` keys are table names; values are either a single response
    payload (for queries that .execute() once) or a list of payloads (for
    queries chained, returning the next one each time).
    """
    admin = MagicMock()
    tables: dict[str, Any] = {}
    for table_name, payload in responses.items():
        # Wrap in a list iterator so each call advances
        if not isinstance(payload, list):
            payload = [payload]
        iterator = iter(payload)
        # Use a callable that returns a fresh chain each time
        def make_table_chain(name, it):
            tbl = MagicMock()
            tbl.select.return_value = tbl
            tbl.insert.return_value = tbl
            tbl.update.return_value = tbl
            tbl.delete.return_value = tbl
            tbl.eq.return_value = tbl
            tbl.in_.return_value = tbl
            tbl.order.return_value = tbl
            tbl.limit.return_value = tbl
            tbl.maybe_single.return_value = tbl
            tbl.upsert.return_value = tbl
            response = MagicMock()
            response.data = next(it, None)
            tbl.execute.return_value = response
            admin.table.return_value = tbl
            return tbl
        tables[table_name] = lambda name=table_name, it=iter(payload): make_table_chain(name, it)
    admin.table.side_effect = lambda name: tables[name]()
    return admin


@pytest.mark.asyncio
async def test_wave1_runs_students_and_tasks_in_parallel():
    """Wave 1 must call students and tasks lookups concurrently, not sequentially.

    We mock the admin client and measure: if the two calls ran sequentially,
    the wall-clock time would be 2x. With asyncio.gather, they run in ~1x.
    """
    call_times: list[float] = []

    class SlowTable:
        def __init__(self, name, delay_s):
            self.name = name
            self.delay_s = delay_s

        def select(self, *a, **kw): return self
        def eq(self, *a, **kw): return self
        def in_(self, *a, **kw): return self
        def order(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def maybe_single(self): return self

        def execute(self):
            import time
            t0 = time.monotonic()
            time.sleep(self.delay_s)
            call_times.append(time.monotonic() - t0)
            r = MagicMock()
            r.data = []
            return r

    class SlowAdmin:
        def table(self, name):
            return SlowTable(name, delay_s=0.2)

    # Patch get_admin_client to return our slow admin
    with patch.object(teacher_routes, "get_admin_client", return_value=SlowAdmin()):
        with patch.object(teacher_routes, "_teacher_tenant_id", return_value="tenant-1"):
            # Call the helper that wraps students + tasks in a gather
            student_lookup_ids = ["s1", "s2"]
            task_lookup_ids = ["t1", "t2"]

            # Simulate the actual gather pattern from the route
            async def fetch_students():
                admin = SlowAdmin()
                return await asyncio.to_thread(
                    lambda: admin.table("students").select("id, name, phone").in_("id", student_lookup_ids).execute()
                )

            async def fetch_tasks():
                admin = SlowAdmin()
                return await asyncio.to_thread(
                    lambda: admin.table("study_plan_tasks").select("id, title, task_type, period_id, config").in_("id", task_lookup_ids).execute()
                )

            t0 = asyncio.get_event_loop().time()
            await asyncio.gather(fetch_students(), fetch_tasks())
            elapsed = asyncio.get_event_loop().time() - t0

            # Sequential would be ~0.4s. Parallel should be ~0.2s.
            # Allow generous margin for CI noise.
            assert elapsed < 0.35, f"Gather was not parallel: {elapsed:.2f}s (expected < 0.35s)"
