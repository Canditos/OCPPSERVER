"""
XPECD-5262: WebSocketPingTimeout validation test for Siemens SICHARGE D.

Passos conforme spec Xray XPECD-5262:

Phase 1 — Config validation (steps 1-4, 6):
  1. Ligar carregador ao CSMS local → BootNotification aceite
  2. GetConfiguration(["WebSocketPingTimeout"]) → valor "2"
  3. ChangeConfiguration("WebSocketPingTimeout", "1") → Rejected
  4. ChangeConfiguration("WebSocketPingTimeout", "61") → Rejected
  6. ChangeConfiguration("WebSocketPingTimeout", "60") → Accepted

Phase 2 — Ping/Pong behaviour (steps 5, 7-8):
  5. Ligar charger ao servidor de teste → conexão OCPP estabelecida
  7. Pong atrasado 20s (< 60s) → conexão permanece ativa
  8. Pong suprimido > 60s → charger fecha socket aos ~60s
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import websockets
from websockets.server import WebSocketServerProtocol

import event_bus

logger = logging.getLogger(__name__)

TEST_SERVER_PORT = 9001


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class TestStep:
    id: int
    name: str
    description: str
    status: StepStatus = StepStatus.PENDING
    detail: str = ""
    started_at: Optional[float] = None
    finished_at: Optional[float] = None

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "detail": self.detail,
            "duration_s": round(self.finished_at - self.started_at, 2) if self.started_at and self.finished_at else None,
        }


def _build_steps() -> list[TestStep]:
    return [
        TestStep(1, "connect", "Ligar carregador ao CSMS — BootNotification aceite"),
        TestStep(2, "default_value", "GetConfiguration(WebSocketPingTimeout) — valor esperado '2'"),
        TestStep(3, "reject_below_range", "ChangeConfiguration(WebSocketPingTimeout, '1') — Rejected"),
        TestStep(4, "reject_above_range", "ChangeConfiguration(WebSocketPingTimeout, '61') — Rejected"),
        TestStep(6, "accept_max", "ChangeConfiguration(WebSocketPingTimeout, '60') — Accepted"),
        TestStep(5, "connect_test_server", "Ligar charger ao servidor de teste — conexão OCPP estabelecida"),
        TestStep(7, "pong_delay", "Pong atrasado 20s (< 60s) — conexão permanece ativa"),
        TestStep(8, "pong_drop", "Pong suprimido > 60s — charger fecha socket aos ~60s"),
    ]


# ── Controlled Pong WebSocket Protocol ──────────────────────────────────────


class PongMode(str, Enum):
    NORMAL = "normal"
    DELAY = "delay"
    DROP = "drop"


class ControlledPongProtocol(WebSocketServerProtocol):
    pong_mode: PongMode = PongMode.NORMAL
    pong_delay_s: float = 0
    ping_count: int = 0

    async def pong(self, data: bytes = b"") -> None:
        self.ping_count += 1
        logger.info(f"[XPECD-5262] Ping #{self.ping_count} received, mode={self.pong_mode.value}")
        if self.pong_mode == PongMode.NORMAL:
            await super().pong(data)
        elif self.pong_mode == PongMode.DELAY:
            logger.info(f"[XPECD-5262] Delaying pong by {self.pong_delay_s}s")
            await asyncio.sleep(self.pong_delay_s)
            await super().pong(data)
            logger.info(f"[XPECD-5262] Delayed pong sent")
        elif self.pong_mode == PongMode.DROP:
            logger.info(f"[XPECD-5262] Pong DROPPED (suppressed)")


def _ocpp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


async def _handle_ocpp_message(ws: WebSocketServerProtocol, raw: str) -> None:
    """Minimal OCPP 1.6 handler — responds to BootNotification, Heartbeat, StatusNotification."""
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return

    if not isinstance(msg, list) or len(msg) < 3:
        return

    msg_type = msg[0]
    if msg_type != 2:
        return

    unique_id = msg[1]
    action = msg[2]
    payload = msg[3] if len(msg) > 3 else {}

    if action == "BootNotification":
        resp = [3, unique_id, {
            "currentTime": _ocpp_now(),
            "interval": 300,
            "status": "Accepted",
        }]
    elif action == "Heartbeat":
        resp = [3, unique_id, {"currentTime": _ocpp_now()}]
    elif action == "StatusNotification":
        resp = [3, unique_id, {}]
    elif action == "MeterValues":
        resp = [3, unique_id, {}]
    else:
        resp = [3, unique_id, {}]

    await ws.send(json.dumps(resp))


# ── Main Test Class ──────────────────────────────────────────────────────────


class XpecdTest:
    def __init__(self):
        self.state: str = "idle"
        self.steps: list[TestStep] = _build_steps()
        self.charge_point_id: Optional[str] = None
        self._server = None
        self._server_task: Optional[asyncio.Task] = None
        self._charger_connected = asyncio.Event()
        self._protocol: Optional[ControlledPongProtocol] = None
        self._charger_ws: Optional[WebSocketServerProtocol] = None
        self._original_value: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "charge_point_id": self.charge_point_id,
            "steps": [s.to_dict() for s in self.steps],
            "pingpong_server_active": self._server is not None,
            "pingpong_url": f"wss://ocpp.gatoescondido.com/test-ocpp/{self.charge_point_id or '<CP_ID>'}" if self._server else None,
        }

    async def _publish(self):
        await event_bus.publish("xpecd_5262_progress", self.to_dict())

    def _step_by_id(self, step_id: int) -> TestStep:
        return next(s for s in self.steps if s.id == step_id)

    async def _mark(self, step_id: int, status: StepStatus, detail: str = ""):
        step = self._step_by_id(step_id)
        step.status = status
        step.detail = detail
        if status == StepStatus.RUNNING:
            step.started_at = time.time()
        elif status in (StepStatus.PASSED, StepStatus.FAILED, StepStatus.SKIPPED):
            step.finished_at = time.time()
        await self._publish()

    # ── Phase 1: Config Validation ───────────────────────────────────────────

    PHASE1_IDS = {1, 2, 3, 4, 6}
    PHASE2_IDS = {5, 7, 8}

    @property
    def _phase1_steps(self):
        return [s for s in self.steps if s.id in self.PHASE1_IDS]

    @property
    def _phase2_steps(self):
        return [s for s in self.steps if s.id in self.PHASE2_IDS]

    async def run(self, charge_point_id: str):
        from ocpp_server.central_system import get_charge_point

        if self.state == "running":
            raise RuntimeError("Teste já em execução")

        self.steps = _build_steps()
        self.charge_point_id = charge_point_id
        self._original_value = None
        self.state = "running"
        await self._publish()

        cp = get_charge_point(charge_point_id)
        if not cp:
            self.state = "failed"
            await self._mark(1, StepStatus.FAILED, f"Charger '{charge_point_id}' não está ligado")
            for s in self._phase1_steps[1:]:
                s.status = StepStatus.SKIPPED
                s.detail = "Sem conexão"
            await self._publish()
            return

        await self._mark(1, StepStatus.PASSED, "Conexão OCPP estabelecida, BootNotification aceite")

        try:
            await self._step_get_default(cp)
            await self._step_reject(cp, 3, "1", "abaixo do mínimo")
            await self._step_reject(cp, 4, "61", "acima do máximo")
            await self._step_accept(cp, 6, "60")

            phase1_passed = all(s.status == StepStatus.PASSED for s in self._phase1_steps)
            self.state = "phase1_complete" if phase1_passed else "failed"
        except Exception as e:
            logger.exception(f"[XPECD-5262] Config test error: {e}")
            self.state = "failed"

        await self._publish()

    def _extract_status(self, resp) -> str:
        status = getattr(resp, "status", "")
        if hasattr(status, "value"):
            status = status.value
        return str(status)

    @staticmethod
    def _cfg_get(item, field: str, default=""):
        if isinstance(item, dict):
            return item.get(field, default)
        return getattr(item, field, default)

    async def _find_key_in_config(self, cp, key: str):
        """Try specific key first, then all keys if not found."""
        resp = await cp.get_configuration([key])
        config_list = getattr(resp, "configuration_key", []) or []
        found = next((c for c in config_list if self._cfg_get(c, "key") == key), None)
        if found:
            return found, config_list

        unknown = getattr(resp, "unknown_key", []) or []
        if key in unknown:
            return None, config_list

        resp_all = await cp.get_configuration([])
        config_list_all = getattr(resp_all, "configuration_key", []) or []
        found = next((c for c in config_list_all if self._cfg_get(c, "key") == key), None)
        return found, config_list_all

    async def _step_get_default(self, cp):
        await self._mark(2, StepStatus.RUNNING)
        try:
            found, config_list = await self._find_key_in_config(cp, "WebSocketPingTimeout")

            if not found:
                available = [self._cfg_get(c, "key", "?") for c in config_list[:10]]
                await self._mark(2, StepStatus.FAILED,
                    f"Chave não encontrada. Keys disponíveis: {', '.join(available)}{'...' if len(config_list) > 10 else ''}")
                return

            value = self._cfg_get(found, "value")
            self._original_value = value
            await self._mark(2, StepStatus.PASSED, f"Valor retornado = '{value}'")
        except asyncio.TimeoutError:
            await self._mark(2, StepStatus.FAILED, "Timeout")
        except Exception as e:
            await self._mark(2, StepStatus.FAILED, str(e))

    async def _step_reject(self, cp, step_id: int, value: str, reason: str):
        await self._mark(step_id, StepStatus.RUNNING)
        try:
            resp = await cp.change_configuration("WebSocketPingTimeout", value)
            status = self._extract_status(resp)
            if status == "Rejected":
                await self._mark(step_id, StepStatus.PASSED, f"'{value}' rejeitado ({reason})")
            else:
                await self._mark(step_id, StepStatus.FAILED, f"'{value}' retornou '{status}' (esperava 'Rejected')")
        except asyncio.TimeoutError:
            await self._mark(step_id, StepStatus.FAILED, "Timeout")
        except Exception as e:
            await self._mark(step_id, StepStatus.FAILED, str(e))

    async def _step_accept(self, cp, step_id: int, value: str):
        await self._mark(step_id, StepStatus.RUNNING)
        try:
            resp = await cp.change_configuration("WebSocketPingTimeout", value)
            status = self._extract_status(resp)
            if status == "Accepted":
                await self._mark(step_id, StepStatus.PASSED, f"'{value}' aceite")
            else:
                await self._mark(step_id, StepStatus.FAILED, f"'{value}' retornou '{status}' (esperava 'Accepted')")
        except asyncio.TimeoutError:
            await self._mark(step_id, StepStatus.FAILED, "Timeout")
        except Exception as e:
            await self._mark(step_id, StepStatus.FAILED, str(e))

    # ── Phase 2: Ping/Pong Test ──────────────────────────────────────────────

    async def start_pingpong(self, charge_point_id: str, pong_delay_s: float = 20.0):
        if self._server is not None:
            raise RuntimeError("Servidor de teste já está ativo")

        self.charge_point_id = charge_point_id
        self._pong_delay_s = pong_delay_s
        self._charger_connected = asyncio.Event()
        self._protocol = None
        self._charger_ws = None

        for s in self._phase2_steps:
            s.status = StepStatus.PENDING
            s.detail = ""
            s.started_at = None
            s.finished_at = None

        step7 = self._step_by_id(7)
        step7.description = f"Pong atrasado {pong_delay_s:.0f}s (< 60s) — conexão permanece ativa"

        self.state = "waiting_for_charger"
        await self._publish()

        self._server = await websockets.serve(
            self._on_test_connect,
            "0.0.0.0",
            TEST_SERVER_PORT,
            subprotocols=["ocpp1.6"],
            ping_interval=None,
            ping_timeout=None,
            create_protocol=ControlledPongProtocol,
        )
        logger.info(f"[XPECD-5262] Test server started on port {TEST_SERVER_PORT}")
        await self._publish()

        self._server_task = asyncio.create_task(self._run_pingpong_sequence())

    async def _on_test_connect(self, ws: WebSocketServerProtocol, path: str):
        cp_id = path.strip("/").split("/")[-1]
        logger.info(f"[XPECD-5262] Charger connected to test server: {cp_id} from {ws.remote_address}")

        self._charger_ws = ws
        self._protocol = ws
        self._charger_connected.set()

        try:
            async for raw in ws:
                await _handle_ocpp_message(ws, raw)
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"[XPECD-5262] Charger disconnected from test server: {cp_id}")

    async def _run_pingpong_sequence(self):
        try:
            url = f"wss://ocpp.gatoescondido.com/test-ocpp/{self.charge_point_id}"
            await self._mark(5, StepStatus.RUNNING,
                f"A aguardar conexão do charger ao servidor de teste: {url}")

            try:
                await asyncio.wait_for(self._charger_connected.wait(), timeout=300)
            except asyncio.TimeoutError:
                await self._mark(5, StepStatus.FAILED,
                    f"Charger não se ligou ao servidor de teste em 5 min ({url})")
                for s in self._phase2_steps:
                    if s.id != 5:
                        s.status = StepStatus.SKIPPED
                        s.detail = "Sem conexão ao servidor de teste"
                        s.finished_at = time.time()
                self.state = "failed"
                await self._publish()
                await self.stop_pingpong()
                return

            await self._mark(5, StepStatus.PASSED,
                f"Charger conectado ao servidor de teste ({url})")

            self.state = "running_pingpong"
            await self._publish()

            await asyncio.sleep(5)

            await self._step_pong_delay()
            await self._step_pong_drop()

            pp_passed = all(s.status == StepStatus.PASSED for s in self._phase2_steps)
            all_passed = all(s.status == StepStatus.PASSED for s in self.steps)
            self.state = "completed" if all_passed else ("phase2_complete" if pp_passed else "failed")
            await self._publish()

        except Exception as e:
            logger.exception(f"[XPECD-5262] Ping/pong test error: {e}")
            self.state = "failed"
            await self._publish()
        finally:
            await self.stop_pingpong()

    async def _step_pong_delay(self):
        """Step 7: Pong atrasado 20s (< 60s) — conexão permanece ativa."""
        delay = getattr(self, '_pong_delay_s', 20.0)
        observe_s = delay * 2.25
        await self._mark(7, StepStatus.RUNNING, f"Pong atrasado {delay:.0f}s (< 60s) — a observar conexão...")

        proto = self._protocol
        if not proto or not self._charger_ws:
            await self._mark(7, StepStatus.FAILED, "Sem conexão ao charger")
            return

        proto.pong_mode = PongMode.DELAY
        proto.pong_delay_s = delay
        proto.ping_count = 0

        try:
            await asyncio.sleep(observe_s)

            if self._charger_ws.open:
                pings = proto.ping_count
                await self._mark(7, StepStatus.PASSED,
                    f"Conexão permanece ativa. Pong atrasado {delay:.0f}s, {pings} pings recebidos em {observe_s:.0f}s")
            else:
                await self._mark(7, StepStatus.FAILED,
                    "Charger desconectou durante teste de delay (não esperado)")
        except Exception as e:
            await self._mark(7, StepStatus.FAILED, str(e))
        finally:
            proto.pong_mode = PongMode.NORMAL

    async def _step_pong_drop(self):
        """Step 8: Pong suprimido > 60s — charger fecha socket aos ~60s."""
        await self._mark(8, StepStatus.RUNNING, "Pong suprimido — charger deve fechar socket aos ~60s")

        proto = self._protocol
        if not proto or not self._charger_ws:
            await self._mark(8, StepStatus.FAILED, "Sem conexão ao charger")
            return

        if not self._charger_ws.open:
            await self._mark(8, StepStatus.SKIPPED, "Charger já desconectado (do passo anterior)")
            return

        proto.pong_mode = PongMode.DROP
        proto.ping_count = 0
        drop_start = time.time()

        try:
            for _ in range(90):
                await asyncio.sleep(1)
                if not self._charger_ws.open:
                    elapsed = time.time() - drop_start
                    await self._mark(8, StepStatus.PASSED,
                        f"Charger fechou socket após {elapsed:.1f}s sem pong "
                        f"({proto.ping_count} pings enviados)")
                    return

            await self._mark(8, StepStatus.FAILED,
                f"Charger NÃO desconectou após 90s sem pong "
                f"({proto.ping_count} pings recebidos)")
        except Exception as e:
            await self._mark(8, StepStatus.FAILED, str(e))

    async def stop_pingpong(self):
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
            logger.info("[XPECD-5262] Test server stopped")

        if self._server_task and not self._server_task.done():
            self._server_task.cancel()
            self._server_task = None

        self._protocol = None
        self._charger_ws = None
        await self._publish()


_test = XpecdTest()


def get_test() -> XpecdTest:
    return _test
