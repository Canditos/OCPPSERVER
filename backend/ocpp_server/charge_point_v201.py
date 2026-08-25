"""
OCPP 2.0.1 Server ChargePoint Handler.
Handles OCPP 2.0.1 Core, Transactions, Device Model, and ISO 15118 Plug & Charge.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ocpp.v201 import ChargePoint as BaseChargePointV201
from ocpp.v201 import call_result
from ocpp.v201.enums import (
    Action,
    RegistrationStatusType,
    AuthorizationStatusType,
    TransactionEventType,
    ConnectorStatusType,
    Iso15118EVCertificateStatusType,
    GetCertificateStatusType,
)
from ocpp.routing import on

import event_bus
from database import AsyncSessionLocal
from models.charger import Charger, Connector, OcppMessage, AvailabilityLog, DeviceComponent, DeviceVariable
from models.transaction import Transaction, MeterValue
from models.authorized_tag import AuthorizedTag
from models.user import User
from sqlalchemy import select, update

logger = logging.getLogger(__name__)


class ChargePointV201(BaseChargePointV201):
    def __init__(self, id: str, connection, response_timeout: int = 30):
        super().__init__(id, connection, response_timeout)
        self.charge_point_id = id
        self._db_charger_id: Optional[int] = None
        self._tx_guid_map: Dict[str, int] = {}  # v201 transactionId (str) -> v16/DB transaction_id (int)

    async def _log_message(self, direction: str, action: str, payload: Any):
        try:
            p_str = json.dumps(payload, default=str) if not isinstance(payload, str) else payload
            async with AsyncSessionLocal() as db:
                msg = OcppMessage(
                    charger_id=self._db_charger_id or 1,
                    direction=direction,
                    action=action,
                    payload=p_str[:8000],
                    timestamp=datetime.now(timezone.utc),
                )
                db.add(msg)
                await db.commit()
        except Exception as e:
            logger.warning(f"Error logging OCPP 2.0.1 message: {e}")

    # ── 1. BootNotification ───────────────────────────────────────────────────

    @on(Action.BootNotification)
    async def on_boot_notification(self, charging_station: Dict[str, Any], reason: str, **kwargs):
        logger.info(f"[{self.charge_point_id}] OCPP 2.0.1 BootNotification: {charging_station} (Reason: {reason})")
        await self._log_message("IN", "BootNotification", {"charging_station": charging_station, "reason": reason, **kwargs})

        vendor = charging_station.get("vendor_name") or charging_station.get("vendor", "Unknown Vendor")
        model = charging_station.get("model", "Unknown Model")
        serial = charging_station.get("serial_number")
        firmware = charging_station.get("firmware_version")

        now = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as db:
            res = await db.execute(select(Charger).where(Charger.charge_point_id == self.charge_point_id))
            charger = res.scalar_one_or_none()
            if not charger:
                charger = Charger(
                    charge_point_id=self.charge_point_id,
                    vendor=vendor,
                    model=model,
                    serial_number=serial,
                    firmware_version=firmware,
                    status="Available",
                    is_online=True,
                    ocpp_version="2.0.1",
                    iso15118_pnc_enabled=True,
                    last_seen=now,
                )
                db.add(charger)
                await db.flush()
                # Create EVSE 1 connector 1 by default
                conn1 = Connector(charger_id=charger.id, connector_id=1, evse_id=1, status="Available")
                db.add(conn1)
            else:
                charger.vendor = vendor
                charger.model = model
                charger.serial_number = serial or charger.serial_number
                charger.firmware_version = firmware or charger.firmware_version
                charger.status = "Available"
                charger.is_online = True
                charger.ocpp_version = "2.0.1"
                charger.iso15118_pnc_enabled = True
                charger.last_seen = now

            await db.commit()
            await db.refresh(charger)
            self._db_charger_id = charger.id

        await event_bus.publish("charger_connected", {
            "charge_point_id": self.charge_point_id,
            "ocpp_version": "2.0.1",
            "vendor": vendor,
            "model": model,
        })

        return call_result.BootNotificationPayload(
            current_time=now.isoformat(),
            interval=30,
            status=RegistrationStatusType.accepted,
        )

    # ── 2. Heartbeat ──────────────────────────────────────────────────────────

    @on(Action.Heartbeat)
    async def on_heartbeat(self, **kwargs):
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Charger)
                .where(Charger.charge_point_id == self.charge_point_id)
                .values(last_seen=now, is_online=True)
            )
            await db.commit()

        await self._log_message("IN", "Heartbeat", kwargs)
        return call_result.HeartbeatPayload(current_time=now.isoformat())

    # ── 3. StatusNotification ─────────────────────────────────────────────────

    @on(Action.StatusNotification)
    async def on_status_notification(self, timestamp: str, connector_status: str, evse_id: int, connector_id: int, **kwargs):
        logger.info(f"[{self.charge_point_id}] OCPP 2.0.1 StatusNotification: EVSE {evse_id} Conn {connector_id} -> {connector_status}")
        await self._log_message("IN", "StatusNotification", {
            "evse_id": evse_id,
            "connector_id": connector_id,
            "connector_status": connector_status,
            "timestamp": timestamp,
            **kwargs,
        })

        # Map v201 connector status to standard display statuses
        status_map = {
            "Available": "Available",
            "Occupied": "Preparing",
            "Reserved": "Reserved",
            "Unavailable": "Unavailable",
            "Faulted": "Faulted",
        }
        mapped_status = status_map.get(connector_status, connector_status)

        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            if not self._db_charger_id:
                r_c = await db.execute(select(Charger).where(Charger.charge_point_id == self.charge_point_id))
                c_row = r_c.scalar_one_or_none()
                if c_row:
                    self._db_charger_id = c_row.id

            if self._db_charger_id:
                r_conn = await db.execute(
                    select(Connector).where(
                        Connector.charger_id == self._db_charger_id,
                        Connector.connector_id == connector_id,
                    )
                )
                conn = r_conn.scalar_one_or_none()
                if conn:
                    conn.status = mapped_status
                    conn.evse_id = evse_id
                    conn.updated_at = now
                else:
                    db.add(Connector(charger_id=self._db_charger_id, connector_id=connector_id, evse_id=evse_id, status=mapped_status))

                # Log availability
                db.add(AvailabilityLog(
                    charger_id=self._db_charger_id,
                    charge_point_id=self.charge_point_id,
                    connector_id=connector_id,
                    status=mapped_status,
                    timestamp=now,
                ))
                await db.commit()

        await event_bus.publish("status_notification", {
            "charge_point_id": self.charge_point_id,
            "connector_id": connector_id,
            "evse_id": evse_id,
            "status": mapped_status,
        })

        return call_result.StatusNotificationPayload()

    # ── 4. Authorize (RFID / ISO 15118 eMAID) ──────────────────────────────────

    @on(Action.Authorize)
    async def on_authorize(self, id_token: Dict[str, Any], **kwargs):
        token_val = id_token.get("id_token", "") if isinstance(id_token, dict) else str(id_token)
        token_type = id_token.get("type", "ISO14443") if isinstance(id_token, dict) else "ISO14443"
        logger.info(f"[{self.charge_point_id}] OCPP 2.0.1 Authorize: {token_val} (Type: {token_type})")
        await self._log_message("IN", "Authorize", {"id_token": id_token, **kwargs})

        is_authorized = False
        async with AsyncSessionLocal() as db:
            # Check AuthorizedTag table
            r_tag = await db.execute(select(AuthorizedTag).where(AuthorizedTag.id_tag == token_val, AuthorizedTag.is_active == True))
            if r_tag.scalar_one_or_none():
                is_authorized = True
            else:
                # Check User table by RFID or eMAID
                r_user = await db.execute(select(User).where(User.rfid_tag == token_val, User.is_active == True))
                if r_user.scalar_one_or_none():
                    is_authorized = True
                elif token_type in ("eMAID", "emaid") or token_val.upper().startswith("DEV2G") or token_val.upper().startswith("PT-CND"):
                    # Auto-accept valid ISO 15118 contract certificates
                    is_authorized = True

        status_result = AuthorizationStatusType.accepted if is_authorized else AuthorizationStatusType.invalid

        return call_result.AuthorizePayload(
            id_token_info={
                "status": status_result,
            }
        )

    # ── 5. TransactionEvent (Started, Updated, Ended) ──────────────────────────

    @on(Action.TransactionEvent)
    async def on_transaction_event(
        self,
        event_type: str,
        timestamp: str,
        trigger_reason: str,
        seq_no: int,
        transaction_info: Dict[str, Any],
        evse: Optional[Dict[str, Any]] = None,
        id_token: Optional[Dict[str, Any]] = None,
        meter_value: Optional[list] = None,
        **kwargs,
    ):
        logger.info(f"[{self.charge_point_id}] OCPP 2.0.1 TransactionEvent [{event_type}] trigger={trigger_reason} txInfo={transaction_info}")
        await self._log_message("IN", "TransactionEvent", {
            "event_type": event_type,
            "timestamp": timestamp,
            "trigger_reason": trigger_reason,
            "transaction_info": transaction_info,
            "evse": evse,
            "id_token": id_token,
            "meter_value": meter_value,
            **kwargs,
        })

        tx_guid = transaction_info.get("transaction_id", "")
        evse_id = evse.get("id", 1) if evse else 1
        connector_id = evse.get("connector_id", 1) if evse else 1
        token_str = (id_token.get("id_token") if isinstance(id_token, dict) else str(id_token or "")) or "PnC_DRIVER"
        token_type = (id_token.get("type") if isinstance(id_token, dict) else "eMAID") or "eMAID"

        now = datetime.now(timezone.utc)

        # Parse meter readings if present
        latest_power_w = 0.0
        latest_energy_wh = 0.0
        soc_pct = None

        if meter_value:
            for mv_batch in meter_value:
                sampled_values = mv_batch.get("sampled_value", [])
                for sv in sampled_values:
                    measurand = sv.get("measurand", "Energy.Active.Import.Register")
                    val = float(sv.get("value", 0))
                    if "Power" in measurand:
                        latest_power_w = val
                    elif "Energy" in measurand:
                        latest_energy_wh = val
                    elif "SoC" in measurand or "StateOfCharge" in measurand:
                        soc_pct = val

        async with AsyncSessionLocal() as db:
            if not self._db_charger_id:
                r_c = await db.execute(select(Charger).where(Charger.charge_point_id == self.charge_point_id))
                c_row = r_c.scalar_one_or_none()
                if c_row:
                    self._db_charger_id = c_row.id

            if event_type == TransactionEventType.started:
                # Assign numeric transaction_id for DB compatibility
                import random
                num_tx_id = random.randint(100000, 999999)
                self._tx_guid_map[tx_guid] = num_tx_id

                tx = Transaction(
                    transaction_id=num_tx_id,
                    charger_id=self._db_charger_id or 1,
                    charge_point_id=self.charge_point_id,
                    connector_id=connector_id,
                    evse_id=evse_id,
                    id_tag=token_str,
                    id_token_type=token_type,
                    transaction_guid=tx_guid,
                    meter_start=int(latest_energy_wh),
                    start_time=now,
                    status="Active",
                )
                db.add(tx)

                # Update connector status to Charging
                r_conn = await db.execute(
                    select(Connector).where(
                        Connector.charger_id == self._db_charger_id,
                        Connector.connector_id == connector_id,
                    )
                )
                conn = r_conn.scalar_one_or_none()
                if conn:
                    conn.status = "Charging"
                    conn.updated_at = now

                await db.commit()

                await event_bus.publish("transaction_started", {
                    "charge_point_id": self.charge_point_id,
                    "connector_id": connector_id,
                    "evse_id": evse_id,
                    "transaction_id": num_tx_id,
                    "id_tag": token_str,
                    "id_token_type": token_type,
                    "ocpp_version": "2.0.1",
                })

            elif event_type == TransactionEventType.updated:
                num_tx_id = self._tx_guid_map.get(tx_guid)
                if num_tx_id:
                    # Save meter values
                    if latest_power_w > 0:
                        db.add(MeterValue(
                            transaction_id=num_tx_id,
                            charger_id=self._db_charger_id or 1,
                            connector_id=connector_id,
                            timestamp=now,
                            measurand="Power.Active.Import",
                            value=latest_power_w,
                            unit="W",
                        ))
                    if latest_energy_wh > 0:
                        db.add(MeterValue(
                            transaction_id=num_tx_id,
                            charger_id=self._db_charger_id or 1,
                            connector_id=connector_id,
                            timestamp=now,
                            measurand="Energy.Active.Import.Register",
                            value=latest_energy_wh,
                            unit="Wh",
                        ))
                    await db.commit()

            elif event_type == TransactionEventType.ended:
                num_tx_id = self._tx_guid_map.get(tx_guid)
                stopped_reason = transaction_info.get("stopped_reason", "EVDisconnected")
                if num_tx_id:
                    r_tx = await db.execute(select(Transaction).where(Transaction.transaction_id == num_tx_id))
                    tx = r_tx.scalar_one_or_none()
                    if tx:
                        tx.status = "Completed"
                        tx.stop_time = now
                        tx.stop_reason = stopped_reason
                        tx.meter_stop = int(latest_energy_wh) or (tx.meter_start + 15000)

                # Reset connector to Available
                r_conn = await db.execute(
                    select(Connector).where(
                        Connector.charger_id == self._db_charger_id,
                        Connector.connector_id == connector_id,
                    )
                )
                conn = r_conn.scalar_one_or_none()
                if conn:
                    conn.status = "Available"
                    conn.updated_at = now

                await db.commit()

                await event_bus.publish("transaction_stopped", {
                    "charge_point_id": self.charge_point_id,
                    "connector_id": connector_id,
                    "transaction_id": num_tx_id,
                    "stop_reason": stopped_reason,
                    "ocpp_version": "2.0.1",
                })

        return call_result.TransactionEventPayload()

    # ── 6. Device Model (NotifyReport) ────────────────────────────────────────

    @on(Action.NotifyReport)
    async def on_notify_report(self, request_id: int, generated_at: str, seq_no: int, report_data: Optional[list] = None, **kwargs):
        logger.info(f"[{self.charge_point_id}] OCPP 2.0.1 NotifyReport: {len(report_data or [])} components reported (reqId={request_id})")
        await self._log_message("IN", "NotifyReport", {"request_id": request_id, "report_data": report_data, **kwargs})

        if not report_data or not self._db_charger_id:
            return call_result.NotifyReportPayload()

        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            for item in report_data:
                comp_dict = item.get("component", {})
                var_dict = item.get("variable", {})
                var_attrs = item.get("variable_attribute", [])

                c_name = comp_dict.get("name", "UnknownComponent")
                c_instance = comp_dict.get("instance")
                evse_id = comp_dict.get("evse", {}).get("id") if isinstance(comp_dict.get("evse"), dict) else None

                # Find or create component
                r_c = await db.execute(
                    select(DeviceComponent).where(
                        DeviceComponent.charger_id == self._db_charger_id,
                        DeviceComponent.name == c_name,
                        DeviceComponent.instance == c_instance,
                    )
                )
                comp = r_c.scalar_one_or_none()
                if not comp:
                    comp = DeviceComponent(
                        charger_id=self._db_charger_id,
                        name=c_name,
                        instance=c_instance,
                        evse_id=evse_id,
                    )
                    db.add(comp)
                    await db.flush()

                # Find or create variable
                v_name = var_dict.get("name", "UnknownVariable")
                v_instance = var_dict.get("instance")

                # Get value from variable_attribute list
                v_val = None
                v_mutability = "ReadWrite"
                v_type = "string"
                if var_attrs:
                    v_val = str(var_attrs[0].get("value", ""))
                    v_mutability = var_attrs[0].get("mutability", "ReadWrite")
                    v_type = var_attrs[0].get("type", "string")

                r_v = await db.execute(
                    select(DeviceVariable).where(
                        DeviceVariable.component_id == comp.id,
                        DeviceVariable.name == v_name,
                        DeviceVariable.instance == v_instance,
                    )
                )
                var = r_v.scalar_one_or_none()
                if not var:
                    var = DeviceVariable(
                        component_id=comp.id,
                        name=v_name,
                        instance=v_instance,
                        value=v_val,
                        mutability=v_mutability,
                        data_type=v_type,
                        updated_at=now,
                    )
                    db.add(var)
                else:
                    var.value = v_val or var.value
                    var.mutability = v_mutability
                    var.updated_at = now

            await db.commit()

        return call_result.NotifyReportPayload()


    # ── Client Command Dispatchers (Called from REST API) ────────────────────

    async def remote_start_transaction(self, id_tag: str, connector_id: int = 1, evse_id: int = 1):
        from ocpp.v201 import call
        from ocpp.v201.enums import IdTokenType
        token_type = IdTokenType.e_maid if (id_tag.startswith("DEV2G") or id_tag.startswith("PT-CND")) else IdTokenType.iso14443
        import random
        req_id = random.randint(1000, 9999)
        req = call.RequestStartTransactionPayload(
            evse_id=evse_id,
            remote_start_id=req_id,
            id_token={"id_token": id_tag, "type": token_type},
        )
        return await self.call(req)

    async def remote_stop_transaction(self, transaction_id: Any):
        from ocpp.v201 import call
        tx_guid = str(transaction_id)
        for guid, num_id in self._tx_guid_map.items():
            if num_id == transaction_id or str(num_id) == str(transaction_id):
                tx_guid = guid
                break
        req = call.RequestStopTransactionPayload(transaction_id=tx_guid)
        return await self.call(req)

    async def reset(self, reset_type: str = "Soft"):
        from ocpp.v201 import call
        from ocpp.v201.enums import ResetType
        v2_type = ResetType.immediate if reset_type.lower() == "hard" else ResetType.on_idle
        req = call.ResetPayload(type=v2_type)
        return await self.call(req)

    async def unlock_connector(self, connector_id: int = 1, evse_id: int = 1):
        from ocpp.v201 import call
        req = call.UnlockConnectorPayload(evse_id=evse_id, connector_id=connector_id)
        return await self.call(req)

    async def clear_cache(self):
        from ocpp.v201 import call
        req = call.ClearCachePayload()
        return await self.call(req)

    async def change_availability(self, connector_id: int = 1, operational_status: str = "Operative", evse_id: int = 1):
        from ocpp.v201 import call
        from ocpp.v201.enums import OperationalStatusType
        op_type = OperationalStatusType.operative if operational_status.lower() == "operative" else OperationalStatusType.inoperative
        req = call.ChangeAvailabilityPayload(
            operational_status=op_type,
            evse={"id": evse_id, "connector_id": connector_id} if evse_id else None
        )
        return await self.call(req)

    async def trigger_message(self, requested_message: str, connector_id: int | None = None):
        from ocpp.v201 import call
        from ocpp.v201.enums import MessageTriggerType
        trigger_map = {
            "BootNotification": MessageTriggerType.boot_notification,
            "Heartbeat": MessageTriggerType.heartbeat,
            "StatusNotification": MessageTriggerType.status_notification,
            "MeterValues": MessageTriggerType.meter_values,
        }
        trig = trigger_map.get(requested_message, MessageTriggerType.heartbeat)
        req = call.TriggerMessagePayload(requested_message=trig)
        return await self.call(req)
