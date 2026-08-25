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
from ocpp.v16 import call
from ocpp.v16.enums import (
    RegistrationStatus,
    ChargePointStatus,
    ChargePointErrorCode,
    Reason,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SIM-1.6] %(levelname)s: %(message)s")
logger = logging.getLogger("SimulatorV16")


class VirtualVersiChargeV16(BaseClientV16):
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
