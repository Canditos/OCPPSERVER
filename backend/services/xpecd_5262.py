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
import html
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
    logs: list[str] = field(default_factory=list)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "detail": self.detail,
            "duration_s": round(self.finished_at - self.started_at, 2) if self.started_at and self.finished_at else None,
            "logs": self.logs,
        }


def _build_steps() -> list[TestStep]:
    return [
        TestStep(1, "connect", "Ligar carregador ao CSMS — BootNotification aceite"),
        TestStep(2, "default_value", "GetConfiguration(WebSocketPingTimeout) — valor esperado '2'"),
        TestStep(3, "reject_below_range", "ChangeConfiguration(WebSocketPingTimeout, '1') — Rejected"),
        TestStep(4, "reject_above_range", "ChangeConfiguration(WebSocketPingTimeout, '61') — Rejected"),
        TestStep(6, "accept_max", "ChangeConfiguration(WebSocketPingTimeout, '60') — Accepted"),
        TestStep(5, "connect_test_server", "Ligar charger ao servidor de teste — conexão OCPP estabelecida"),
        TestStep(7, "pong_delay_20", "Pong delayed 20s (< timeout) — connection stays open"),
        TestStep(8, "pong_delay_40", "Pong delayed 40s (< timeout) — connection stays open"),
        TestStep(9, "pong_delay_50", "Pong delayed 50s (< timeout) — connection stays open"),
        TestStep(10, "pong_drop", "Pong suppressed > 60s — charger closes socket at ~60s"),
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

    def _log(self, step_id: int, message: str):
        step = self._step_by_id(step_id)
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        step.logs.append(f"[{ts}] {message}")

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
    PHASE2_IDS = {5, 7, 8, 9, 10}

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
        self._log(1, f"Looking up charge point '{charge_point_id}'")
        if not cp:
            self.state = "failed"
            self._log(1, f"Charge point '{charge_point_id}' not found or not connected")
            await self._mark(1, StepStatus.FAILED, f"Charger '{charge_point_id}' não está ligado")
            for s in self._phase1_steps[1:]:
                s.status = StepStatus.SKIPPED
                s.detail = "Sem conexão"
            await self._publish()
            return

        self._log(1, f"Charge point '{charge_point_id}' found — OCPP connection established")
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
            self._log(2, "Sending GetConfiguration(['WebSocketPingTimeout'])")
            found, config_list = await self._find_key_in_config(cp, "WebSocketPingTimeout")

            if not found:
                available = [self._cfg_get(c, "key", "?") for c in config_list[:10]]
                self._log(2, f"Key not found. Available keys: {', '.join(available)}")
                await self._mark(2, StepStatus.FAILED,
                    f"Chave não encontrada. Keys disponíveis: {', '.join(available)}{'...' if len(config_list) > 10 else ''}")
                return

            value = self._cfg_get(found, "value")
            self._original_value = value
            self._log(2, f"GetConfiguration response: value='{value}'")
            await self._mark(2, StepStatus.PASSED, f"Valor retornado = '{value}'")
        except asyncio.TimeoutError:
            self._log(2, "GetConfiguration timed out")
            await self._mark(2, StepStatus.FAILED, "Timeout")
        except Exception as e:
            self._log(2, f"Error: {e}")
            await self._mark(2, StepStatus.FAILED, str(e))

    async def _step_reject(self, cp, step_id: int, value: str, reason: str):
        await self._mark(step_id, StepStatus.RUNNING)
        try:
            self._log(step_id, f"Sending ChangeConfiguration('WebSocketPingTimeout', '{value}')")
            resp = await cp.change_configuration("WebSocketPingTimeout", value)
            status = self._extract_status(resp)
            self._log(step_id, f"Response status: '{status}'")
            if status == "Rejected":
                self._log(step_id, f"Value '{value}' correctly rejected ({reason})")
                await self._mark(step_id, StepStatus.PASSED, f"'{value}' rejeitado ({reason})")
            else:
                self._log(step_id, f"Expected 'Rejected' but got '{status}'")
                await self._mark(step_id, StepStatus.FAILED, f"'{value}' retornou '{status}' (esperava 'Rejected')")
        except asyncio.TimeoutError:
            self._log(step_id, "ChangeConfiguration timed out")
            await self._mark(step_id, StepStatus.FAILED, "Timeout")
        except Exception as e:
            self._log(step_id, f"Error: {e}")
            await self._mark(step_id, StepStatus.FAILED, str(e))

    async def _step_accept(self, cp, step_id: int, value: str):
        await self._mark(step_id, StepStatus.RUNNING)
        try:
            self._log(step_id, f"Sending ChangeConfiguration('WebSocketPingTimeout', '{value}')")
            resp = await cp.change_configuration("WebSocketPingTimeout", value)
            status = self._extract_status(resp)
            self._log(step_id, f"Response status: '{status}'")
            if status == "Accepted":
                self._log(step_id, f"Value '{value}' accepted as expected")
                await self._mark(step_id, StepStatus.PASSED, f"'{value}' aceite")
            else:
                self._log(step_id, f"Expected 'Accepted' but got '{status}'")
                await self._mark(step_id, StepStatus.FAILED, f"'{value}' retornou '{status}' (esperava 'Accepted')")
        except asyncio.TimeoutError:
            self._log(step_id, "ChangeConfiguration timed out")
            await self._mark(step_id, StepStatus.FAILED, "Timeout")
        except Exception as e:
            self._log(step_id, f"Error: {e}")
            await self._mark(step_id, StepStatus.FAILED, str(e))

    # ── Phase 2: Ping/Pong Test ──────────────────────────────────────────────

    async def start_pingpong(self, charge_point_id: str):
        if self._server is not None:
            raise RuntimeError("Servidor de teste já está ativo")

        self.charge_point_id = charge_point_id
        self._charger_connected = asyncio.Event()
        self._protocol = None
        self._charger_ws = None

        for s in self._phase2_steps:
            s.status = StepStatus.PENDING
            s.detail = ""
            s.started_at = None
            s.finished_at = None
            s.logs = []

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
            self._log(5, f"Test server listening on port {TEST_SERVER_PORT}")
            self._log(5, f"Waiting for charger connection at {url}")
            await self._mark(5, StepStatus.RUNNING,
                f"A aguardar conexão do charger ao servidor de teste: {url}")

            try:
                await asyncio.wait_for(self._charger_connected.wait(), timeout=300)
            except asyncio.TimeoutError:
                self._log(5, "Timeout: charger did not connect within 300s")
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

            self._log(5, f"Charger connected from {self._charger_ws.remote_address}")
            await self._mark(5, StepStatus.PASSED,
                f"Charger conectado ao servidor de teste ({url})")

            self.state = "running_pingpong"
            await self._publish()

            await asyncio.sleep(5)

            await self._step_pong_delay(7, 20)
            await self._step_pong_delay(8, 40)
            await self._step_pong_delay(9, 50)
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

    async def _step_pong_delay(self, step_id: int, delay: int):
        """Pong delayed by `delay` seconds — connection must stay open (timeout=60s)."""
        observe_s = delay + 45
        self._log(step_id, f"Setting pong delay to {delay}s, observing for {observe_s}s")
        await self._mark(step_id, StepStatus.RUNNING,
            f"Pong delayed {delay}s — connection must stay open (timeout=60s)")

        proto = self._protocol
        if not proto or not self._charger_ws:
            self._log(step_id, "No charger connection available")
            await self._mark(step_id, StepStatus.FAILED, "No charger connection")
            return

        if not self._charger_ws.open:
            self._log(step_id, "Charger already disconnected from previous step")
            await self._mark(step_id, StepStatus.SKIPPED, "Charger already disconnected (from previous step)")
            return

        try:
            proto.pong_mode = PongMode.DELAY
            proto.pong_delay_s = delay
            proto.ping_count = 0

            await asyncio.sleep(observe_s)

            if self._charger_ws.open:
                pings = proto.ping_count
                self._log(step_id, f"PASS: {delay}s delay — connection alive after {observe_s}s, {pings} pings received")
                await self._mark(step_id, StepStatus.PASSED,
                    f"Connection stayed open with {delay}s pong delay ({pings} pings in {observe_s}s)")
            else:
                self._log(step_id, f"FAIL: Charger disconnected during {delay}s delay test")
                await self._mark(step_id, StepStatus.FAILED,
                    f"Charger disconnected during {delay}s delay test")
        except Exception as e:
            self._log(step_id, f"Error: {e}")
            await self._mark(step_id, StepStatus.FAILED, str(e))
        finally:
            proto.pong_mode = PongMode.NORMAL
            self._log(step_id, "Pong mode reset to NORMAL")
            await asyncio.sleep(3)

    async def _step_pong_drop(self):
        """Step 10: Pong suppressed > 60s — charger closes socket at ~60s."""
        self._log(10, "Starting pong drop test — suppressing all pong responses")
        await self._mark(10, StepStatus.RUNNING, "Pong suppressed — charger should close socket at ~60s")

        proto = self._protocol
        if not proto or not self._charger_ws:
            self._log(10, "No charger connection available")
            await self._mark(10, StepStatus.FAILED, "No charger connection")
            return

        if not self._charger_ws.open:
            self._log(10, "Charger already disconnected from previous step")
            await self._mark(10, StepStatus.SKIPPED, "Charger already disconnected (from previous step)")
            return

        proto.pong_mode = PongMode.DROP
        proto.ping_count = 0
        drop_start = time.time()
        self._log(10, "Pong mode set to DROP — all pong frames suppressed")

        try:
            for tick in range(90):
                await asyncio.sleep(1)
                if not self._charger_ws.open:
                    elapsed = time.time() - drop_start
                    self._log(10, f"Charger closed socket after {elapsed:.1f}s ({proto.ping_count} pings sent)")
                    await self._mark(10, StepStatus.PASSED,
                        f"Charger closed socket after {elapsed:.1f}s without pong "
                        f"({proto.ping_count} pings sent)")
                    return
                if (tick + 1) % 15 == 0:
                    self._log(10, f"Still connected after {tick + 1}s, {proto.ping_count} pings so far")

            self._log(10, f"FAIL: Charger did NOT disconnect after 90s ({proto.ping_count} pings)")
            await self._mark(10, StepStatus.FAILED,
                f"Charger did NOT disconnect after 90s without pong "
                f"({proto.ping_count} pings received)")
        except Exception as e:
            self._log(10, f"Error: {e}")
            await self._mark(10, StepStatus.FAILED, str(e))

    def generate_report(self) -> str:
        now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
        cp_id = html.escape(self.charge_point_id or "N/A")
        all_passed = all(s.status == StepStatus.PASSED for s in self.steps)
        overall = "PASS" if all_passed else "FAIL"
        overall_color = "var(--pass)" if all_passed else "var(--fail)"
        overall_border = overall_color

        def status_pill(status: StepStatus) -> str:
            cls = {"passed": "result--pass", "failed": "result--fail"}.get(status.value, "result--skip")
            label = status.value.upper()
            return f'<span class="result {cls}">{label}</span>'

        def step_row(s: "TestStep") -> str:
            duration = f"{s.finished_at - s.started_at:.1f}s" if s.started_at and s.finished_at else "-"
            detail = html.escape(s.detail) if s.detail else ""
            logs_html = ""
            if s.logs:
                items = "".join(f"<li>{html.escape(l)}</li>" for l in s.logs)
                logs_html = f'<details><summary>Logs ({len(s.logs)} entries)</summary><ul>{items}</ul></details>'
            return (
                f"<tr>"
                f"<td><strong>#{s.id}</strong></td>"
                f"<td><strong>{html.escape(s.name)}</strong></td>"
                f"<td>{html.escape(s.description)}</td>"
                f"<td style='text-align:center'>{status_pill(s.status)}</td>"
                f"<td>{duration}</td>"
                f"<td>{detail}{logs_html}</td>"
                f"</tr>"
            )

        phase1_rows = "".join(step_row(s) for s in self.steps if s.id in self.PHASE1_IDS)
        phase2_rows = "".join(step_row(s) for s in self.steps if s.id in self.PHASE2_IDS)

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>XPECD-5262 Test Report — {cp_id}</title>
<style>
:root {{ --siemens-petrol: #009999; --siemens-ink: #001b2e; --siemens-blue: #007993; --mist: #f3f7f8; --line: #d7e2e5; --muted: #52636d; --pass: #107c41; --fail: #b42318; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: #e9f0f2; color: var(--siemens-ink); font-family: "Segoe UI", Arial, sans-serif; font-size: 14px; line-height: 1.45; }}
.card {{ max-width: 1180px; min-height: 100vh; margin: 0 auto; background: #fff; box-shadow: 0 0 32px rgba(0, 27, 46, .12); }}
.header {{ position: relative; overflow: hidden; min-height: 218px; padding: 32px 48px; color: #fff; background: var(--siemens-ink); display: flex; justify-content: space-between; align-items: flex-start; }}
.header::after {{ content: ""; position: absolute; right: -70px; bottom: -145px; width: 520px; height: 340px; border: 48px solid var(--siemens-petrol); border-radius: 50%; opacity: .95; }}
.brand, .header-copy, .meta {{ position: relative; z-index: 1; }}
.brand {{ font-family: Arial, sans-serif; font-size: 28px; font-weight: 800; letter-spacing: -2px; line-height: 1; color: var(--siemens-petrol); }}
.header-copy {{ align-self: flex-end; margin-top: 72px; }}
.eyebrow {{ margin-bottom: 8px; color: #8ce0dc; font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; }}
.header h1 {{ max-width: 660px; margin: 0; font-size: clamp(28px, 4vw, 42px); font-weight: 300; letter-spacing: -.8px; line-height: 1.06; }}
.header h1 strong {{ font-weight: 700; }}
.subtitle {{ margin: 12px 0 0; color: #c7dde2; font-size: 15px; }}
.meta {{ min-width: 190px; margin-left: 28px; padding: 14px 0 14px 18px; border-left: 2px solid var(--siemens-petrol); font-size: 12px; line-height: 1.8; }}
.meta span {{ display: block; color: #9fb7c0; text-transform: uppercase; letter-spacing: .7px; font-size: 10px; }}
.meta strong {{ color: #fff; font-size: 15px; font-weight: 600; }}
.content {{ padding: 40px 48px 54px; overflow-x: hidden; }}
.summary-box {{ display: grid; grid-template-columns: auto 1fr; gap: 20px; align-items: center; margin-bottom: 40px; padding: 20px 24px; border: 1px solid var(--line); border-left: 6px solid {overall_border}; background: var(--mist); }}
.summary-state {{ color: {overall_color}; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }}
.summary-box h3 {{ margin: 2px 0 3px; font-size: 21px; font-weight: 600; letter-spacing: -.25px; }}
.summary-box p {{ margin: 0; color: var(--muted); }}
.section-title {{ display: flex; align-items: baseline; gap: 12px; margin: 34px 0 12px; color: var(--siemens-ink); font-size: 20px; font-weight: 600; letter-spacing: -.3px; }}
.section-title::before {{ content: ""; width: 22px; height: 4px; background: var(--siemens-petrol); }}
.table-wrap {{ width: 100%; overflow-x: auto; border: 1px solid var(--line); }}
table {{ width: 100%; min-width: 760px; border-collapse: collapse; table-layout: fixed; }}
th {{ padding: 12px 14px; background: var(--siemens-ink); border-right: 1px solid #244051; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .75px; text-align: left; text-transform: uppercase; }}
th:last-child {{ border-right: 0; }}
td {{ padding: 14px; border-bottom: 1px solid var(--line); color: #263b47; font-size: 13px; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }}
tbody tr:nth-child(even) {{ background: #f9fbfc; }}
tbody tr:hover {{ background: #e9f7f7; }}
tbody tr:last-child td {{ border-bottom: 0; }}
td strong {{ color: var(--siemens-ink); font-weight: 650; }}
.result {{ display: inline-block; min-width: 68px; padding: 4px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: .6px; text-align: center; text-transform: uppercase; }}
.result--pass {{ background: #dff3e7; color: var(--pass); }}
.result--fail {{ background: #fde8e6; color: var(--fail); }}
.result--skip {{ background: #fef3cd; color: #856404; }}
details {{ margin-top: 8px; }}
details ul {{ max-width: 100%; margin: 6px 0 0; padding: 10px 25px; background: #f8fafb; border-radius: 4px; overflow-wrap: anywhere; word-break: break-word; }}
details li {{ margin: 5px 0; font-size: 12px; font-family: Consolas, "Courier New", monospace; }}
summary {{ color: var(--siemens-blue) !important; font-weight: 600; cursor: pointer; }}
.footer {{ display: flex; justify-content: space-between; gap: 16px; padding: 20px 48px; background: var(--siemens-ink); color: #b6cbd3; font-size: 11px; letter-spacing: .3px; }}
.footer strong {{ color: #fff; font-weight: 600; }}
@media print {{ body {{ background: #fff; }} .card {{ max-width: none; box-shadow: none; }} }}
</style>
</head>
<body>
<div class="card">
    <div class="header">
        <div class="brand" aria-label="Siemens">SIEMENS</div>
        <div class="header-copy">
            <div class="eyebrow">SiCharge D / XPECD-5262</div>
            <h1>WebSocketPingTimeout <strong>Validation Report</strong></h1>
            <p class="subtitle">Automated verification of WebSocketPingTimeout configuration and ping/pong behaviour.</p>
        </div>
        <div class="meta">
            <span>Generated</span>
            <strong>{now}</strong>
            <span>Charge Point</span>
            <strong>{cp_id}</strong>
        </div>
    </div>
    <div class="content">
        <div class="summary-box">
            <div class="summary-state">{overall}</div>
            <div>
                <h3>Test {overall.lower()}ed</h3>
                <p>Charge Point: <strong>{cp_id}</strong> &middot; Steps: <strong>{sum(1 for s in self.steps if s.status == StepStatus.PASSED)}/{len(self.steps)} passed</strong></p>
            </div>
        </div>

        <div class="section-title">Phase 1 — Configuration Validation</div>
        <div class="table-wrap"><table>
            <thead><tr>
                <th style="width:6%">#</th>
                <th style="width:14%">Step</th>
                <th style="width:28%">Description</th>
                <th style="width:10%;text-align:center">Result</th>
                <th style="width:8%">Duration</th>
                <th style="width:34%">Detail</th>
            </tr></thead>
            <tbody>{phase1_rows}</tbody>
        </table></div>

        <div class="section-title">Phase 2 — Ping/Pong Behaviour</div>
        <div class="table-wrap"><table>
            <thead><tr>
                <th style="width:6%">#</th>
                <th style="width:14%">Step</th>
                <th style="width:28%">Description</th>
                <th style="width:10%;text-align:center">Result</th>
                <th style="width:8%">Duration</th>
                <th style="width:34%">Detail</th>
            </tr></thead>
            <tbody>{phase2_rows}</tbody>
        </table></div>
    </div>
    <div class="footer">
        <span><strong>Siemens</strong> — XPECD-5262 WebSocketPingTimeout Test</span>
        <span>Report generated automatically</span>
    </div>
</div>
</body>
</html>"""

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
