"""
OCPP 1.6-J Siemens VersiCharge Virtual Station Simulator.
Simulates a smart AC Charger communicating over OCPP 1.6 JSON with RFID Authorization and MeterValues.
"""

import asyncio
import logging
import sys
from datetime import datetime, timezone
import websockets
from ocpp.v16 import ChargePoint as BaseClientV16
from ocpp.v16 import call, call_result
from ocpp.routing import on
from ocpp.v16.enums import (
    RegistrationStatus,
    ChargePointStatus,
    ChargePointErrorCode,
    Reason,
    RemoteStartStopStatus,
    ResetStatus,
    UnlockStatus,
    ChargingProfileStatus,
    ClearChargingProfileStatus,
    GetCompositeScheduleStatus,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SIM-1.6] %(levelname)s: %(message)s")
logger = logging.getLogger("SimulatorV16")


class VirtualVersiChargeV16(BaseClientV16):
    _active_profiles: dict = {}

    @on(Action.SetChargingProfile)
    async def on_set_charging_profile(self, connector_id: int, cs_charging_profiles: dict, **kwargs):
        logger.info(f"[SIM-1.6] Received SetChargingProfile for connector={connector_id}: {cs_charging_profiles}")
        self._active_profiles[connector_id] = cs_charging_profiles
        return call_result.SetChargingProfilePayload(status=ChargingProfileStatus.accepted)

    @on(Action.ClearChargingProfile)
    async def on_clear_charging_profile(self, id: int = None, connector_id: int = None, **kwargs):
        logger.info(f"[SIM-1.6] Received ClearChargingProfile id={id}, conn={connector_id}")
        if connector_id is not None and connector_id in self._active_profiles:
            del self._active_profiles[connector_id]
        else:
            self._active_profiles.clear()
        return call_result.ClearChargingProfilePayload(status=ClearChargingProfileStatus.accepted)

    @on(Action.GetCompositeSchedule)
    async def on_get_composite_schedule(self, connector_id: int, duration: int, charging_rate_unit: str = "A", **kwargs):
        logger.info(f"[SIM-1.6] Received GetCompositeSchedule connector={connector_id}, duration={duration}, unit={charging_rate_unit}")
        active_prof = self._active_profiles.get(connector_id) or self._active_profiles.get(0)
        
        if active_prof and "chargingSchedule" in active_prof:
            schedule = active_prof["chargingSchedule"]
            return call_result.GetCompositeSchedulePayload(
                status=GetCompositeScheduleStatus.accepted,
                connector_id=connector_id,
                schedule_start=schedule.get("startSchedule", datetime.now(timezone.utc).isoformat()),
                charging_schedule=schedule,
            )
        
        # Default schedule if none set
        return call_result.GetCompositeSchedulePayload(
            status=GetCompositeScheduleStatus.accepted,
            connector_id=connector_id,
            schedule_start=datetime.now(timezone.utc).isoformat(),
            charging_schedule={
                "chargingRateUnit": charging_rate_unit or "A",
                "duration": duration,
                "chargingSchedulePeriod": [
                    {"startPeriod": 0, "limit": 32.0 if charging_rate_unit == "A" else 22000.0}
                ]
            }
        )

    _stop_requested: bool = False
    @on(Action.RemoteStartTransaction)
    async def on_remote_start(self, id_tag: str, connector_id: int = 1, **kwargs):
        logger.info(f"[SIM-1.6] Received RemoteStartTransaction for tag={id_tag}, connector={connector_id}")
        asyncio.create_task(self.simulate_charge_session(id_tag=id_tag, duration_seconds=15))
        return call_result.RemoteStartTransactionPayload(status=RemoteStartStopStatus.accepted)

    @on(Action.RemoteStopTransaction)
    async def on_remote_stop(self, transaction_id: int, **kwargs):
        logger.info(f"[SIM-1.6] Received RemoteStopTransaction for tx={transaction_id}")
        self._stop_requested = True
        return call_result.RemoteStopTransactionPayload(status=RemoteStartStopStatus.accepted)

    @on(Action.Reset)
    async def on_reset(self, type: str, **kwargs):
        logger.info(f"[SIM-1.6] Received Reset ({type})")
        return call_result.ResetPayload(status=ResetStatus.accepted)

    @on(Action.UnlockConnector)
    async def on_unlock_connector(self, connector_id: int, **kwargs):
        logger.info(f"[SIM-1.6] Received UnlockConnector for connector={connector_id}")
        return call_result.UnlockConnectorPayload(status=UnlockStatus.unlocked)

    async def send_boot_notification(self):
        req = call.BootNotificationPayload(
            charge_point_vendor="Siemens",
            charge_point_model="VersiCharge Gen 3 (22kW)",
            charge_point_serial_number="SN-VC3-2026-PT",
            firmware_version="v2.1.8-RELEASE",
        )
        resp = await self.call(req)
        logger.info(f"BootNotification response: status={resp.status}, interval={resp.interval}")
        return resp

    async def simulate_charge_session(self, id_tag: str = "VERSICHARGE_TAG", duration_seconds: int = 15):
        now_str = datetime.now(timezone.utc).isoformat()

        logger.info(f"Driver swiped RFID tag: {id_tag}")

        # 1. Authorize RFID Tag
        auth_resp = await self.call(call.AuthorizePayload(id_tag=id_tag))
        logger.info(f"Authorize response: {auth_resp.id_tag_info}")

        # 2. Status: Preparing
        await self.call(call.StatusNotificationPayload(
            connector_id=1,
            error_code=ChargePointErrorCode.no_error,
            status=ChargePointStatus.preparing,
        ))
        await asyncio.sleep(2)

        # 3. StartTransaction
        start_resp = await self.call(call.StartTransactionPayload(
            connector_id=1,
            id_tag=id_tag,
            meter_start=0,
            timestamp=datetime.now(timezone.utc).isoformat(),
        ))
        tx_id = start_resp.transaction_id
        logger.info(f"StartTransaction accepted: transactionId={tx_id}")

        # 4. Status: Charging
        await self.call(call.StatusNotificationPayload(
            connector_id=1,
            error_code=ChargePointErrorCode.no_error,
            status=ChargePointStatus.charging,
        ))

        # 5. Stream MeterValues
        steps = max(1, duration_seconds // 3)
        total_energy_wh = 0.0
        for i in range(1, steps + 1):
            await asyncio.sleep(3)
            power_kw = 22.0  # 3-phase 32A AC fast charging
            total_energy_wh += (power_kw * 1000.0 * (3 / 3600.0))
            soc = min(100.0, 40.0 + (i * 12.0))

            await self.call(call.MeterValuesPayload(
                connector_id=1,
                transaction_id=tx_id,
                meter_value=[
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "sampled_value": [
                            {"value": str(power_kw * 1000.0), "measurand": "Power.Active.Import", "unit": "W"},
                            {"value": str(int(total_energy_wh)), "measurand": "Energy.Active.Import.Register", "unit": "Wh"},
                            {"value": "230.0", "measurand": "Voltage", "unit": "V"},
                            {"value": "32.0", "measurand": "Current.Import", "unit": "A"},
                            {"value": str(int(soc)), "measurand": "SoC", "unit": "Percent"},
                        ],
                    }
                ],
            ))
            logger.info(f"MeterValues: Power={power_kw}kW, Energy={total_energy_wh/1000:.2f}kWh, SoC={int(soc)}%")

        # 6. StopTransaction
        await asyncio.sleep(1)
        await self.call(call.StopTransactionPayload(
            transaction_id=tx_id,
            id_tag=id_tag,
            meter_stop=int(total_energy_wh),
            timestamp=datetime.now(timezone.utc).isoformat(),
            reason=Reason.local,
        ))
        logger.info(f"StopTransaction sent. Total energy delivered: {total_energy_wh/1000:.2f} kWh")

        # 7. Status: Available
        await self.call(call.StatusNotificationPayload(
            connector_id=1,
            error_code=ChargePointErrorCode.no_error,
            status=ChargePointStatus.available,
        ))
        logger.info("Connector #1 is now Available.")


async def run_simulator_16(server_url: str = "ws://127.0.0.1:8000/ocpp/versicharge_01"):
    logger.info(f"Connecting to Central System at {server_url} (subprotocol: ocpp1.6)...")
    async with websockets.connect(server_url, subprotocols=["ocpp1.6"]) as ws:
        station = VirtualVersiChargeV16("versicharge_01", ws)
        task = asyncio.create_task(station.start())

        # Boot
        await station.send_boot_notification()
        await asyncio.sleep(1)

        # Status Available
        await station.call(call.StatusNotificationPayload(
            connector_id=1,
            error_code=ChargePointErrorCode.no_error,
            status=ChargePointStatus.available,
        ))
        await asyncio.sleep(1)

        # Charge session
        await station.simulate_charge_session(id_tag="VERSICHARGE_TAG", duration_seconds=12)

        # Heartbeats
        for _ in range(3):
            await asyncio.sleep(5)
            await station.call(call.HeartbeatPayload())

        task.cancel()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8000/ocpp/versicharge_01"
    asyncio.run(run_simulator_16(url))
