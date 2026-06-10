"""Tests for the keyset cursor pagination on /super-admin/audit-logs."""
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import application_log_store


@pytest.mark.asyncio
async def test_keyset_query_uses_id_less_than_before_id():
    """When `before_id` is provided, the SQL must use `WHERE id < $before_id`
    (keyset pagination), not OFFSET."""
    with patch.object(application_log_store, "get_neon_pool") as mock_pool:
        # Build a mock connection that captures the SQL passed to fetch()
        captured_sql = []

        class FakeConn:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass
            async def fetch(self, sql, *args):
                captured_sql.append(sql)
                return []

        fake_pool = MagicMock()
        fake_pool.acquire.return_value = FakeConn()
        mock_pool.return_value = fake_pool

        await application_log_store._fetch_log_page(
            tenant_id=None, limit=50, offset=0, before_id=12345
        )

        assert len(captured_sql) == 1
        sql = captured_sql[0]
        assert "id < $1::bigint" in sql
        assert "ORDER BY id DESC" in sql
        assert "OFFSET" not in sql


@pytest.mark.asyncio
async def test_offset_query_uses_offset_when_no_before_id():
    """When `before_id` is None, the legacy OFFSET path is used."""
    with patch.object(application_log_store, "get_neon_pool") as mock_pool:
        captured_sql = []

        class FakeConn:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass
            async def fetch(self, sql, *args):
                captured_sql.append(sql)
                return []

        fake_pool = MagicMock()
        fake_pool.acquire.return_value = FakeConn()
        mock_pool.return_value = fake_pool

        await application_log_store._fetch_log_page(
            tenant_id="tenant-abc", limit=100, offset=200
        )

        assert len(captured_sql) == 1
        sql = captured_sql[0]
        assert "OFFSET $3" in sql
        assert "id <" not in sql


@pytest.mark.asyncio
async def test_keyset_with_tenant_filter_uses_compound_where():
    """Keyset + tenant_id should produce `WHERE tenant_id = $1 AND id < $2`."""
    with patch.object(application_log_store, "get_neon_pool") as mock_pool:
        captured_sql = []

        class FakeConn:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass
            async def fetch(self, sql, *args):
                captured_sql.append(sql)
                return []

        fake_pool = MagicMock()
        fake_pool.acquire.return_value = FakeConn()
        mock_pool.return_value = fake_pool

        await application_log_store._fetch_log_page(
            tenant_id="tenant-abc", limit=50, offset=0, before_id=99999
        )

        assert len(captured_sql) == 1
        sql = captured_sql[0]
        assert "tenant_id = $1::uuid" in sql
        assert "id < $2::bigint" in sql
        assert "OFFSET" not in sql
