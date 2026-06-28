"""Super-admin API gateway management routes."""
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.deps import require_super_admin, TokenData
from app.core.response import success, error
from app.services.api_gateway_service import (
    DEFAULT_POLICIES,
    block_ip,
    get_gateway_config,
    get_gateway_stats,
    list_blocked_ips,
    save_gateway_config,
    unblock_ip,
)

router = APIRouter(prefix="/super-admin/gateway", tags=["gateway"])


class PolicyUpdate(BaseModel):
    limit: Optional[str] = None
    enabled: Optional[bool] = None


class GatewayConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    maintenance_mode: Optional[bool] = None
    maintenance_message: Optional[str] = None
    trust_proxy: Optional[bool] = None
    rate_limit_headers: Optional[bool] = None
    policies: Optional[dict[str, PolicyUpdate]] = None


class BlockIpRequest(BaseModel):
    ip: str = Field(..., min_length=3, max_length=45)


@router.get("/config")
async def get_config(_: TokenData = Depends(require_super_admin)):
    config = await get_gateway_config()
    return success(
        {
            "config": config,
            "defaults": DEFAULT_POLICIES,
        }
    )


@router.patch("/config")
async def update_config(
    body: GatewayConfigUpdate,
    _: TokenData = Depends(require_super_admin),
):
    payload: dict[str, Any] = body.model_dump(exclude_none=True)
    if body.policies:
        payload["policies"] = {
            name: policy.model_dump(exclude_none=True)
            for name, policy in body.policies.items()
            if name in DEFAULT_POLICIES
        }
    config = await save_gateway_config(payload)
    return success({"config": config})


@router.get("/stats")
async def get_stats(_: TokenData = Depends(require_super_admin)):
    stats = await get_gateway_stats()
    config = await get_gateway_config()
    return success({"stats": stats, "config": config})


@router.get("/blocked-ips")
async def get_blocked_ips(_: TokenData = Depends(require_super_admin)):
    ips = await list_blocked_ips()
    return success({"blocked_ips": ips})


@router.post("/blocked-ips")
async def add_blocked_ip(
    body: BlockIpRequest,
    _: TokenData = Depends(require_super_admin),
):
    try:
        await block_ip(body.ip.strip())
    except RuntimeError:
        return error("REDIS_UNAVAILABLE", "Redis is required for IP blocking", 503)
    ips = await list_blocked_ips()
    return success({"blocked_ips": ips})


@router.delete("/blocked-ips/{ip}")
async def remove_blocked_ip(
    ip: str,
    _: TokenData = Depends(require_super_admin),
):
    try:
        await unblock_ip(ip)
    except RuntimeError:
        return error("REDIS_UNAVAILABLE", "Redis is required for IP blocking", 503)
    ips = await list_blocked_ips()
    return success({"blocked_ips": ips})
