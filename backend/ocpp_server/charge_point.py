import asyncio
import json
import logging
from datetime import datetime, timezone

from ocpp.routing import on
from ocpp.v16 import ChargePoint as OcppChargePoint
from ocpp.v16 import call_result, call
from ocpp.v16.enums import (
    Action, AuthorizationStatus, RegistrationStatus, ChargePointStatus,
    RemoteStartStopStatus, ResetStatus, AvailabilityStatus,
    UnlockStatus, ConfigurationStatus, DataTransferStatus,
    TriggerMessageStatus, ReservationStatus, CancelReservationStatus,
    AvailabilityType, ResetType,
)

import event_bus
from database import AsyncSessionLocal
from models.charger import Charger, Connector, OcppMessage
from models.transaction import Transaction, MeterValue
from models.configuration import ChargerConfiguration
from models.auth_token import AuthToken
from models.authorized_tag import AuthorizedTag
from sqlalchemy import select, update, func

logger = logging.getLogger(__name__)
_TX_COUNTER = 100000


def _next_tx_id() -> int:
    global _TX_COUNTER
    _TX_COUNTER += 1
    return _TX_COUNTER


async def _init_tx_counter():
    global _TX_COUNTER
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(func.max(Transaction.transaction_id)))
            max_id = result.scalar()
            if max_id and max_id >= _TX_COUNTER:
                _TX_COUNTER = max_id
    except Exception as e:
        logger.warning(f"Failed to load max transaction ID: {e}")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ChargePoint(OcppChargePoint):
    def __init__(self, cp_id: str, connection, client_ip: str = "unknown"):
        super().__init__(cp_id, connection)
        self.client_ip = client_ip

    async def _log_message(self, direction: str, action: str, payload: dict):
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
                charger = result.scalar_one_or_none()
                if charger:
                    msg = OcppMessage(
                        charger_id=charger.id,
                        direction=direction,
                        action=action,
                        payload=json.dumps(payload)[:4000],
                    )
                    db.add(msg)
                    await db.commit()
        except Exception as e:
            logger.warning(f"Failed to log message: {e}")

    @on(Action.BootNotification)
    async def on_boot_notification(self, charge_point_vendor, charge_point_model, **kwargs):
        await self._log_message("IN", "BootNotification", {
            "vendor": charge_point_vendor, "model": charge_point_model, **kwargs
        })
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
            charger = result.scalar_one_or_none()
            if not charger:
                charger = Charger(charge_point_id=self.id)
                db.add(charger)
            charger.vendor = charge_point_vendor
            charger.model = charge_point_model
            charger.firmware_version = kwargs.get("firmware_version")
            charger.serial_number = kwargs.get("charge_point_serial_number")
            charger.iccid = kwargs.get("iccid")
            charger.imsi = kwargs.get("imsi")
            charger.status = "Available"
            charger.is_online = True
            charger.last_seen = _now()
            charger.client_ip = self.client_ip
            charger.registered_at = charger.registered_at or _now()
            await db.commit()
            await db.refresh(charger)

        await event_bus.publish("charger_connected", {
            "charge_point_id": self.id,
            "vendor": charge_point_vendor,
            "model": charge_point_model,
        })

        result = call_result.BootNotificationPayload(
            current_time=_now().isoformat() + "Z",
            interval=60,
            status=RegistrationStatus.accepted,
        )

        # After responding, push MeterValue config so live power is visible
        asyncio.create_task(self._configure_meter_values())

        return result

    async def _configure_meter_values(self):
        """Send ChangeConfiguration to activate periodic MeterValues if not set."""
        await asyncio.sleep(2)  # let charger settle after BootNotification
        configs = [
            ("MeterValueSampleInterval", "30"),
            ("MeterValuesSampledData",
             "Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage,SoC"),
            ("StopTxnSampledData",
             "Energy.Active.Import.Register,Power.Active.Import"),
        ]
        for key, value in configs:
            try:
                resp = await self.change_configuration(key, value)
                logger.info(f"{self.id}: ChangeConfiguration {key}={value} → {resp.status if resp else 'no response'}")
            except Exception as e:
                logger.warning(f"{self.id}: ChangeConfiguration {key} failed: {e}")

    @on(Action.Heartbeat)
    async def on_heartbeat(self, **kwargs):
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Charger).where(Charger.charge_point_id == self.id)
                .values(last_seen=_now(), is_online=True)
            )
            await db.commit()
        await event_bus.publish("heartbeat", {"charge_point_id": self.id})
        return call_result.HeartbeatPayload(current_time=_now().isoformat() + "Z")

    async def _check_auth(self, id_tag: str) -> AuthorizationStatus:
        async with AsyncSessionLocal() as db:
            charger_row = (await db.execute(
                select(Charger).where(Charger.charge_point_id == self.id)
            )).scalar_one_or_none()
            if charger_row and getattr(charger_row, "autocharge_enabled", False):
                return AuthorizationStatus.accepted

            # Check AuthorizedTag first
            tag = (await db.execute(
                select(AuthorizedTag).where(
                    AuthorizedTag.id_tag == id_tag,
                    AuthorizedTag.is_active == True
                )
            )).scalar_one_or_none()
            if tag:
                return AuthorizationStatus.accepted

            # Check AuthToken table
            token = (await db.execute(
                select(AuthToken).where(
                    AuthToken.id_tag == id_tag,
                    AuthToken.status == "Accepted"
                )
            )).scalar_one_or_none()
            if token:
                if token.expiry_date and token.expiry_date < datetime.utcnow():
                    return AuthorizationStatus.expired
                return AuthorizationStatus.accepted

            # If both tables are empty, auto-accept and seed first tag
            count_tags = (await db.execute(select(func.count()).select_from(AuthorizedTag))).scalar()
            count_tokens = (await db.execute(select(func.count()).select_from(AuthToken))).scalar()
            if (count_tags or 0) == 0 and (count_tokens or 0) == 0:
                new_tag = AuthorizedTag(id_tag=id_tag, description="Auto-registada")
                db.add(new_tag)
                await db.commit()
                return AuthorizationStatus.accepted

            return AuthorizationStatus.invalid

    @on(Action.Authorize)
    async def on_authorize(self, id_tag, **kwargs):
        await self._log_message("IN", "Authorize", {"id_tag": id_tag})
        status = await self._check_auth(id_tag)
        await event_bus.publish("authorize", {
            "charge_point_id": self.id,
            "id_tag": id_tag,
            "status": status.value,
        })
        return call_result.AuthorizePayload(
            id_tag_info={"status": status, "expiryDate": None, "parentIdTag": None}
        )

    @on(Action.StartTransaction)
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        await self._log_message("IN", "StartTransaction", {
            "connector_id": connector_id, "id_tag": id_tag, "meter_start": meter_start
        })

        auth_status = await self._check_auth(id_tag)
        if auth_status != AuthorizationStatus.accepted:
            return call_result.StartTransactionPayload(
                transaction_id=0,
                id_tag_info={"status": auth_status}
            )

        tx_id = _next_tx_id()
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
            charger = result.scalar_one_or_none()
            if charger:
                tx = Transaction(
                    transaction_id=tx_id,
                    charger_id=charger.id,
                    charge_point_id=self.id,
                    connector_id=connector_id,
                    id_tag=id_tag,
                    meter_start=meter_start,
                    start_time=datetime.fromisoformat(timestamp.replace("Z", "+00:00")).replace(tzinfo=None),
                    status="Active",
                )
                db.add(tx)
                charger.status = "Charging"
                await db.commit()

        await event_bus.publish("transaction_started", {
            "charge_point_id": self.id,
            "transaction_id": tx_id,
            "connector_id": connector_id,
            "id_tag": id_tag,
            "meter_start": meter_start,
        })
        return call_result.StartTransactionPayload(
            transaction_id=tx_id,
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    @on(Action.StopTransaction)
    async def on_stop_transaction(self, transaction_id, meter_stop, timestamp, **kwargs):
        await self._log_message("IN", "StopTransaction", {
            "transaction_id": transaction_id, "meter_stop": meter_stop
        })
        reason = kwargs.get("reason", "Local")
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Transaction).where(Transaction.transaction_id == transaction_id))
            tx = result.scalar_one_or_none()
            if tx:
                tx.meter_stop = meter_stop
                tx.stop_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).replace(tzinfo=None)
                tx.stop_reason = reason
                tx.status = "Completed"
                await db.commit()

        await event_bus.publish("transaction_stopped", {
            "charge_point_id": self.id,
            "transaction_id": transaction_id,
            "meter_stop": meter_stop,
            "reason": reason,
        })
        return call_result.StopTransactionPayload(id_tag_info={"status": AuthorizationStatus.accepted})

    @on(Action.MeterValues)
    async def on_meter_values(self, connector_id, meter_value, **kwargs):
        tx_id_ocpp = kwargs.get("transaction_id")
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
            charger = result.scalar_one_or_none()
            db_tx_id = None
            if tx_id_ocpp and charger:
                r2 = await db.execute(select(Transaction).where(Transaction.transaction_id == tx_id_ocpp))
                tx = r2.scalar_one_or_none()
                if tx:
                    db_tx_id = tx.id

            meter_data = []
            for mv in meter_value:
                ts = mv.get("timestamp", _now().isoformat())
                for sv in mv.get("sampled_value", []):
                    try:
                        val = float(sv.get("value", 0))
                    except (ValueError, TypeError):
                        val = 0.0
                    row = MeterValue(
                        transaction_id=db_tx_id or 0,
                        charger_id=charger.id if charger else 0,
                        connector_id=connector_id,
                        timestamp=datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None),
                        measurand=sv.get("measurand", "Energy.Active.Import.Register"),
                        value=val,
                        unit=sv.get("unit"),
                        context=sv.get("context"),
                        phase=sv.get("phase"),
                    )
                    db.add(row)
                    meter_data.append({
                        "measurand": row.measurand,
                        "value": val,
                        "unit": row.unit,
                        "timestamp": ts,
                    })
            await db.commit()

        await event_bus.publish("meter_values", {
            "charge_point_id": self.id,
            "connector_id": connector_id,
            "transaction_id": tx_id_ocpp,
            "values": meter_data,
        })
        return call_result.MeterValuesPayload()

    @on(Action.StatusNotification)
    async def on_status_notification(self, connector_id, error_code, status, **kwargs):
        await self._log_message("IN", "StatusNotification", {
            "connector_id": connector_id, "status": status, "error_code": error_code
        })
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
            charger = result.scalar_one_or_none()
            if charger:
                if connector_id == 0:
                    charger.status = status
                else:
                    r2 = await db.execute(
                        select(Connector).where(
                            Connector.charger_id == charger.id,
                            Connector.connector_id == connector_id
                        )
                    )
                    conn = r2.scalar_one_or_none()
                    if not conn:
                        conn = Connector(charger_id=charger.id, connector_id=connector_id)
                        db.add(conn)
                    conn.status = status
                    conn.error_code = error_code
                    conn.updated_at = _now()
                charger.last_seen = _now()
                await db.commit()

        await event_bus.publish("status_notification", {
            "charge_point_id": self.id,
            "connector_id": connector_id,
            "status": status,
            "error_code": error_code,
        })
        return call_result.StatusNotificationPayload()

    @on(Action.DataTransfer)
    async def on_data_transfer(self, vendor_id, **kwargs):
        await self._log_message("IN", "DataTransfer", {"vendor_id": vendor_id, **kwargs})
        await event_bus.publish("data_transfer", {
            "charge_point_id": self.id,
            "vendor_id": vendor_id,
            "message_id": kwargs.get("message_id"),
            "data": kwargs.get("data"),
        })
        return call_result.DataTransferPayload(status=DataTransferStatus.accepted)

    @on(Action.FirmwareStatusNotification)
    async def on_firmware_status(self, status, **kwargs):
        await event_bus.publish("firmware_status", {"charge_point_id": self.id, "status": status})
        return call_result.FirmwareStatusNotificationPayload()

    @on(Action.DiagnosticsStatusNotification)
    async def on_diagnostics_status(self, status, **kwargs):
        await event_bus.publish("diagnostics_status", {"charge_point_id": self.id, "status": status})
        return call_result.DiagnosticsStatusNotificationPayload()

    # ── Outgoing commands ──────────────────────────────────────────────────

    async def remote_start_transaction(self, id_tag: str, connector_id: int | None = None):
        req = call.RemoteStartTransactionPayload(id_tag=id_tag, connector_id=connector_id)
        resp = await self.call(req)
        await self._log_message("OUT", "RemoteStartTransaction", {"id_tag": id_tag, "connector_id": connector_id})
        return resp

    async def remote_stop_transaction(self, transaction_id: int):
        req = call.RemoteStopTransactionPayload(transaction_id=transaction_id)
        resp = await self.call(req)
        await self._log_message("OUT", "RemoteStopTransaction", {"transaction_id": transaction_id})
        return resp

    async def reset(self, reset_type: str = "Soft"):
        req = call.ResetPayload(type=ResetType(reset_type))
        resp = await self.call(req)
        await self._log_message("OUT", "Reset", {"type": reset_type})
        return resp

    async def change_configuration(self, key: str, value: str):
        req = call.ChangeConfigurationPayload(key=key, value=value)
        resp = await self.call(req)
        await self._log_message("OUT", "ChangeConfiguration", {"key": key, "value": value})
        return resp

    async def get_configuration(self, keys: list[str] | None = None):
        req = call.GetConfigurationPayload(key=keys or [])
        resp = await self.call(req)
        if resp and resp.configuration_key:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
                charger = result.scalar_one_or_none()
                if charger:
                    for item in resp.configuration_key:
                        r2 = await db.execute(
                            select(ChargerConfiguration).where(
                                ChargerConfiguration.charger_id == charger.id,
                                ChargerConfiguration.key == item["key"]
                            )
                        )
                        cfg = r2.scalar_one_or_none()
                        if not cfg:
                            cfg = ChargerConfiguration(charger_id=charger.id, key=item["key"])
                            db.add(cfg)
                        cfg.value = item.get("value")
                        cfg.readonly = item.get("readonly", False)
                    await db.commit()
        return resp

    async def clear_cache(self):
        resp = await self.call(call.ClearCachePayload())
        await self._log_message("OUT", "ClearCache", {})
        return resp

    async def unlock_connector(self, connector_id: int):
        req = call.UnlockConnectorPayload(connector_id=connector_id)
        resp = await self.call(req)
        await self._log_message("OUT", "UnlockConnector", {"connector_id": connector_id})
        return resp

    async def change_availability(self, connector_id: int, availability_type: str):
        req = call.ChangeAvailabilityPayload(
            connector_id=connector_id,
            type=AvailabilityType(availability_type)
        )
        resp = await self.call(req)
        await self._log_message("OUT", "ChangeAvailability", {
            "connector_id": connector_id, "type": availability_type
        })
        return resp

    async def trigger_message(self, requested_message: str, connector_id: int | None = None):
        req = call.TriggerMessagePayload(requested_message=requested_message, connector_id=connector_id)
        resp = await self.call(req)
        await self._log_message("OUT", "TriggerMessage", {
            "requested_message": requested_message, "connector_id": connector_id
        })
        return resp

    async def get_diagnostics(self, location: str, retries: int = 3):
        req = call.GetDiagnosticsPayload(location=location, retries=retries)
        resp = await self.call(req)
        await self._log_message("OUT", "GetDiagnostics", {"location": location})
        return resp

    async def update_firmware(self, location: str, retrieve_date: str, retries: int = 3):
        req = call.UpdateFirmwarePayload(location=location, retrieve_date=retrieve_date, retries=retries)
        resp = await self.call(req)
        await self._log_message("OUT", "UpdateFirmware", {"location": location})
        return resp

    async def send_local_list(self, version: int, update_type: str, local_authorization_list: list):
        req = call.SendLocalListPayload(
            list_version=version,
            update_type=update_type,
            local_authorization_list=local_authorization_list,
        )
        resp = await self.call(req)
        await self._log_message("OUT", "SendLocalList", {"version": version, "update_type": update_type})
        return resp

    async def get_local_list_version(self):
        resp = await self.call(call.GetLocalListVersionPayload())
        await self._log_message("OUT", "GetLocalListVersion", {})
        return resp

    async def reserve_now(self, connector_id: int, expiry_date: str, id_tag: str, reservation_id: int):
        req = call.ReserveNowPayload(
            connector_id=connector_id,
            expiry_date=expiry_date,
            id_tag=id_tag,
            reservation_id=reservation_id,
        )
        resp = await self.call(req)
        await self._log_message("OUT", "ReserveNow", {"connector_id": connector_id, "id_tag": id_tag})
        return resp

    async def cancel_reservation(self, reservation_id: int):
        req = call.CancelReservationPayload(reservation_id=reservation_id)
        resp = await self.call(req)
        await self._log_message("OUT", "CancelReservation", {"reservation_id": reservation_id})
        return resp

    # ── Smart Charging ──────────────────────────────────────────────────────

    async def set_charging_profile(self, connector_id: int, cs_charging_profiles: dict):
        req = call.SetChargingProfilePayload(
            connector_id=connector_id,
            cs_charging_profiles=cs_charging_profiles,
        )
        resp = await self.call(req)
        await self._log_message("OUT", "SetChargingProfile", {
            "connector_id": connector_id,
            "cs_charging_profiles": cs_charging_profiles,
        })
        return resp

    async def clear_charging_profile(
        self,
        profile_id: int | None = None,
        connector_id: int | None = None,
        purpose: str | None = None,
        stack_level: int | None = None,
    ):
        payload_kwargs = {}
        if profile_id is not None:
            payload_kwargs["id"] = profile_id
        if connector_id is not None:
            payload_kwargs["connector_id"] = connector_id
        if purpose is not None:
            payload_kwargs["charging_profile_purpose"] = purpose
        if stack_level is not None:
            payload_kwargs["stack_level"] = stack_level

        req = call.ClearChargingProfilePayload(**payload_kwargs)
        resp = await self.call(req)
        await self._log_message("OUT", "ClearChargingProfile", payload_kwargs)
        return resp

    async def get_composite_schedule(
        self,
        connector_id: int,
        duration: int,
        rate_unit: str | None = None,
    ):
        payload_kwargs = {"connector_id": connector_id, "duration": duration}
        if rate_unit:
            payload_kwargs["charging_rate_unit"] = rate_unit
        req = call.GetCompositeSchedulePayload(**payload_kwargs)
        resp = await self.call(req)
        await self._log_message("OUT", "GetCompositeSchedule", payload_kwargs)
        return resp
