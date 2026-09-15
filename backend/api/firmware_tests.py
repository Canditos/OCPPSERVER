from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import require_admin
from models.user import User
from services.xpecd_5262 import get_test

router = APIRouter(prefix="/firmware-tests", tags=["firmware-tests"])


class RunTestRequest(BaseModel):
    charge_point_id: str


class PingpongStartRequest(BaseModel):
    charge_point_id: str
    pong_delay_s: float = 20.0


@router.post("/xpecd-5262/run")
async def run_xpecd_5262(
    req: RunTestRequest,
    admin: User = Depends(require_admin),
):
    """Phase 1: Config validation (steps 1-5) via existing CSMS connection."""
    test = get_test()
    try:
        await test.run(req.charge_point_id)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return test.to_dict()


@router.post("/xpecd-5262/pingpong/start")
async def start_pingpong(
    req: PingpongStartRequest,
    admin: User = Depends(require_admin),
):
    """Phase 2: Start ping/pong test server and wait for charger connection."""
    test = get_test()
    try:
        await test.start_pingpong(req.charge_point_id, pong_delay_s=req.pong_delay_s)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return test.to_dict()


@router.post("/xpecd-5262/pingpong/stop")
async def stop_pingpong(
    admin: User = Depends(require_admin),
):
    """Stop the ping/pong test server."""
    test = get_test()
    await test.stop_pingpong()
    return test.to_dict()


@router.get("/xpecd-5262/status")
async def status_xpecd_5262(
    admin: User = Depends(require_admin),
):
    return get_test().to_dict()
