"""Tests for the ETag/304 path on /public/tenants/{slug}."""
import hashlib
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.routes.public import router as public_router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(public_router, prefix="/api/v1")
    return TestClient(app)


def _hash(body: bytes) -> str:
    return hashlib.sha1(body).hexdigest()


def test_first_request_returns_200_with_etag(client):
    """First request (no If-None-Match) should return 200 + ETag header."""
    tenant = {"id": "t1", "name": "Acme", "slug": "acme"}
    body_bytes = json.dumps(tenant, sort_keys=True, default=str).encode("utf-8")
    expected_etag = f'W/"{_hash(body_bytes)}"'

    with patch("app.api.v1.routes.public.get_or_set_cache",
               new=AsyncMock(return_value=(tenant, True))):
        with patch("app.api.v1.routes.public.get_admin_client",
                   return_value=MagicMock()):
            response = client.get("/api/v1/public/tenants/acme")

    assert response.status_code == 200
    assert response.headers.get("ETag") == expected_etag
    assert "max-age=300" in response.headers.get("Cache-Control", "")


def test_repeat_request_with_matching_etag_returns_304(client):
    """A second request with If-None-Match matching the current ETag
    should return 304 with no body — saving bandwidth."""
    tenant = {"id": "t1", "name": "Acme", "slug": "acme"}
    body_bytes = json.dumps(tenant, sort_keys=True, default=str).encode("utf-8")
    etag = f'W/"{_hash(body_bytes)}"'

    with patch("app.api.v1.routes.public.get_or_set_cache",
               new=AsyncMock(return_value=(tenant, True))):
        with patch("app.api.v1.routes.public.get_admin_client",
                   return_value=MagicMock()):
            response = client.get(
                "/api/v1/public/tenants/acme",
                headers={"If-None-Match": etag},
            )

    assert response.status_code == 304
    assert response.headers.get("ETag") == etag
    assert response.content == b""  # no body on 304
    # Cache-Control should still be present on 304
    assert "max-age=300" in response.headers.get("Cache-Control", "")


def test_repeat_request_with_stale_etag_returns_200_with_new_body(client):
    """If the client sends a stale ETag, the server should return 200
    with the current body and the new ETag."""
    tenant = {"id": "t1", "name": "Acme", "slug": "acme"}
    stale_etag = 'W/"old-old-old"'

    with patch("app.api.v1.routes.public.get_or_set_cache",
               new=AsyncMock(return_value=(tenant, False))):
        with patch("app.api.v1.routes.public.get_admin_client",
                   return_value=MagicMock()):
            response = client.get(
                "/api/v1/public/tenants/acme",
                headers={"If-None-Match": stale_etag},
            )

    assert response.status_code == 200
    body = response.json()
    assert body["data"] == tenant
    # ETag should be the new one, not the stale one
    assert response.headers.get("ETag") != stale_etag


def test_404_when_tenant_not_found(client):
    """If the tenant doesn't exist (None from cache), return 404."""
    with patch("app.api.v1.routes.public.get_or_set_cache",
               new=AsyncMock(return_value=(None, False))):
        with patch("app.api.v1.routes.public.get_admin_client",
                   return_value=MagicMock()):
            response = client.get("/api/v1/public/tenants/nonexistent")

    assert response.status_code == 404
