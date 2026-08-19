import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import event_bus

router = APIRouter(tags=["events"])


@router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await websocket.accept()
    queue = event_bus.subscribe()
    try:
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(msg)
            except asyncio.TimeoutError:
                await websocket.send_text('{"type":"ping"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        event_bus.unsubscribe(queue)
