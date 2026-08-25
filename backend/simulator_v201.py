"""
OCPP 2.0.1 & ISO 15118 Plug & Charge (PnC) Virtual Station & EV Simulator.
Simulates a high-power dual-EVSE DC Fast Charger communicating over OCPP 2.0.1.
"""

import asyncio
import logging
import sys
import websockets
from ocpp.v201 import ChargePoint as BaseClientV201
from ocpp.v201 import call
from ocpp.v201.enums import (
    RegistrationStatusType,
    TransactionEventType,
    TriggerReasonType,
    IdTokenType,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SIM-2.0.1] %(levelname)s: %(message)s")
logger = logging.getLogger("SimulatorV201")


class VirtualStationV201(BaseClientV201):
    async def send_boot_notification(self):
        req = call.BootNotificationPayload(
            charging_station={
                "model": "SICHARGE D 300kW",
                "vendor_name": "Siemens V201",
                "serial_number": "SN-SIEMENS-2026-V201",
                "firmware_version": "v2.0.1-PNC-RELEASE",
            },
            reason="PowerUp",
        )
        resp = await self.call(req)
        logger.info(f"BootNotification response: status={resp.status}, interval={resp.interval}")
        return resp

    async def send_device_model_report(self):
        report_data = [
            {
                "component": {"name": "OCPPCommCtrlr"},
                "variable": {"name": "HeartbeatInterval"},
                "variable_attribute": [{"value": "30", "mutability": "ReadWrite", "type": "Actual"}],
            },
            {
                "component": {"name": "AuthCtrlr"},
                "variable": {"name": "AuthorizeRemoteTxRequests"},
                "variable_attribute": [{"value": "true", "mutability": "ReadWrite", "type": "Actual"}],
            },
            {
                "component": {"name": "AuthCtrlr"},
                "variable": {"name": "PnCEnabled"},
                "variable_attribute": [{"value": "true", "mutability": "ReadOnly", "type": "Actual"}],
            },
            {
                "component": {"name": "TxCtrlr"},
                "variable": {"name": "EVConnectionTimeOut"},
                "variable_attribute": [{"value": "180", "mutability": "ReadWrite", "type": "Actual"}],
            },
            {
                "component": {"name": "EVSE", "instance": "1", "evse": {"id": 1}},
                "variable": {"name": "MaxCurrent"},
                "variable_attribute": [{"value": "400", "mutability": "ReadOnly", "type": "Actual"}],
            },
            {
                "component": {"name": "EVSE", "instance": "1", "evse": {"id": 1}},
                "variable": {"name": "Power"},
                "variable_attribute": [{"value": "300000", "mutability": "ReadOnly", "type": "Actual"}],
            },
        ]
        req = call.NotifyReportPayload(
            request_id=101,
            generated_at="2026-08-25T12:00:00Z",
            seq_no=0,
            report_data=report_data,
        )
        resp = await self.call(req)
        logger.info(f"NotifyReport (Device Model) sent successfully.")
        return resp

    async def simulate_pnc_charge_session(self, duration_seconds: int = 15):
        emaid_token = "DEV2G1234567890"
        tx_guid = f"urn:uuid:tx-pnc-{int(asyncio.get_event_loop().time())}"

        logger.info("🚗 [ISO 15118] Electric Vehicle connected to EVSE #1 (Plug & Charge initiated)")

        # 1. Status: Occupied / Preparing
        await self.call(call.StatusNotificationPayload(
            timestamp="2026-08-25T12:00:01Z",
            connector_status="Occupied",
            evse_id=1,
            connector_id=1,
        ))
        await asyncio.sleep(2)

        # 2. Authorize with Contract Certificate (eMAID)
        auth_resp = await self.call(call.AuthorizePayload(
            id_token={"id_token": emaid_token, "type": "eMAID"}
        ))
        logger.info(f"[ISO 15118] Authorize response for eMAID '{emaid_token}': {auth_resp.id_token_info}")

        # 3. TransactionEvent: Started
        await self.call(call.TransactionEventPayload(
            event_type=TransactionEventType.started,
            timestamp="2026-08-25T12:00:03Z",
            trigger_reason=TriggerReasonType.authorized,
            seq_no=1,
            transaction_info={"transaction_id": tx_guid, "charging_state": "Charging"},
            evse={"id": 1, "connector_id": 1},
            id_token={"id_token": emaid_token, "type": "eMAID"},
            meter_value=[
                {
                    "timestamp": "2026-08-25T12:00:03Z",
                    "sampled_value": [
                        {"value": 150000.0, "measurand": "Power.Active.Import", "unit_of_measure": {"unit": "W"}},
                        {"value": 10000.0, "measurand": "Energy.Active.Import.Register", "unit_of_measure": {"unit": "Wh"}},
                        {"value": 35.0, "measurand": "SoC", "unit_of_measure": {"unit": "Percent"}},
                    ],
                }
            ],
        ))
        logger.info(f"[ISO 15118] Transaction Started (txGuid={tx_guid}, Power=150kW, SoC=35%)")

        # 4. Stream TransactionEvent: Updated
        steps = max(1, duration_seconds // 3)
        for i in range(1, steps + 1):
            await asyncio.sleep(2)
            current_kw = 150.0 + (i * 10.0)
            energy_wh = 10000.0 + (i * 5000.0)
            soc = min(90.0, 35.0 + (i * 15.0))
            await self.call(call.TransactionEventPayload(
                event_type=TransactionEventType.updated,
                timestamp="2026-08-25T12:00:10Z",
                trigger_reason=TriggerReasonType.meter_value_periodic,
                seq_no=i + 1,
                transaction_info={"transaction_id": tx_guid, "charging_state": "Charging"},
                evse={"id": 1, "connector_id": 1},
                meter_value=[
                    {
                        "timestamp": "2026-08-25T12:00:10Z",
                        "sampled_value": [
                            {"value": current_kw * 1000.0, "measurand": "Power.Active.Import", "unit_of_measure": {"unit": "W"}},
                            {"value": energy_wh, "measurand": "Energy.Active.Import.Register", "unit_of_measure": {"unit": "Wh"}},
                            {"value": soc, "measurand": "SoC", "unit_of_measure": {"unit": "Percent"}},
                        ],
                    }
                ],
            ))
            logger.info(f"[ISO 15118] Telemetry Update: Power={current_kw:.1f}kW, Energy={energy_wh/1000:.2f}kWh, Battery SoC={soc:.0f}%")

        # 5. TransactionEvent: Ended
        await asyncio.sleep(1)
        await self.call(call.TransactionEventPayload(
            event_type=TransactionEventType.ended,
            timestamp="2026-08-25T12:00:30Z",
            trigger_reason=TriggerReasonType.ev_departed,
            seq_no=steps + 2,
            transaction_info={"transaction_id": tx_guid, "stopped_reason": "EVDisconnected", "charging_state": "Idle"},
            evse={"id": 1, "connector_id": 1},
            meter_value=[
                {
                    "timestamp": "2026-08-25T12:00:30Z",
                    "sampled_value": [
                        {"value": 0.0, "measurand": "Power.Active.Import", "unit_of_measure": {"unit": "W"}},
                        {"value": energy_wh + 2500.0, "measurand": "Energy.Active.Import.Register", "unit_of_measure": {"unit": "Wh"}},
                    ],
                }
            ],
        ))
        logger.info(f"[ISO 15118] Transaction Ended. Total Energy delivered: {(energy_wh + 2500.0)/1000:.2f} kWh")

        # 6. Status: Available
        await self.call(call.StatusNotificationPayload(
            timestamp="2026-08-25T12:00:32Z",
            connector_status="Available",
            evse_id=1,
            connector_id=1,
        ))
        logger.info("[ISO 15118] EVSE #1 is now Available for next vehicle.")


async def run_simulator(server_url: str = "ws://127.0.0.1:8000/ocpp/chargerPT_v201"):
    logger.info(f"Connecting to Central System at {server_url} (subprotocol: ocpp2.0.1)...")
    async with websockets.connect(server_url, subprotocols=["ocpp2.0.1"]) as ws:
        station = VirtualStationV201("chargerPT_v201", ws)
        task = asyncio.create_task(station.start())

        # Send BootNotification
        await station.send_boot_notification()
        await asyncio.sleep(1)

        # Send Device Model Inventory
        await station.send_device_model_report()
        await asyncio.sleep(2)

        # Simulate Plug & Charge session
        await station.simulate_pnc_charge_session(duration_seconds=12)

        logger.info("Simulation completed successfully. Keeping connection open for Heartbeats...")
        for _ in range(3):
            await asyncio.sleep(5)
            await station.call(call.HeartbeatPayload())

        task.cancel()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8000/ocpp/chargerPT_v201"
    asyncio.run(run_simulator(url))
