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
from models.charger import Charger, Connector, OcppMessage, AvailabilityLog
from models.transaction import Transaction, MeterValue
from models.meter_key import MeterPublicKey
from services.ocmf_service import parse_ocmf, verify_ocmf_signature
from models.configuration import ChargerConfiguration
from models.auth_token import AuthToken
from models.authorized_tag import AuthorizedTag
from models.user import User
from services.email_service import notify_ac_suspended_ev, notify_dc_charging_completed
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
            avail = AvailabilityLog(
                charger_id=charger.id,
                charge_point_id=self.id,
                connector_id=0,
                status="Available",
                info="BootNotification",
                timestamp=_now(),
            )
            db.add(avail)
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
        await self._log_message("IN", "Heartbeat", kwargs)
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
        auth_status = await self._check_auth(id_tag)
        if auth_status != AuthorizationStatus.accepted:
            await self._log_message("IN", "StartTransaction", {
                "connector_id": connector_id,
                "id_tag": id_tag,
                "meter_start": meter_start,
                "status": "Rejected",
                "timestamp": timestamp,
                **kwargs,
            })
            return call_result.StartTransactionPayload(
                transaction_id=0,
                id_tag_info={"status": auth_status}
            )

        tx_id = _next_tx_id()
        await self._log_message("IN", "StartTransaction", {
            "connector_id": connector_id,
            "id_tag": id_tag,
            "meter_start": meter_start,
            "transaction_id": tx_id,
            "timestamp": timestamp,
            **kwargs,
        })
        await self._log_message("OUT", "StartTransactionResponse", {
            "transaction_id": tx_id,
            "id_tag_info": {"status": "Accepted"}
        })
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
        stopped_connector_id = 1
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Transaction).where(Transaction.transaction_id == transaction_id))
            tx = result.scalar_one_or_none()
            if tx:
                tx.meter_stop = meter_stop
                tx.stop_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).replace(tzinfo=None)
                tx.stop_reason = reason
                tx.status = "Completed"
                stopped_connector_id = tx.connector_id

                # Check if transaction_data contains OCMF SignedData
                tx_data = kwargs.get("transaction_data", [])
                if isinstance(tx_data, list):
                    for mv_entry in tx_data:
                        for sv in mv_entry.get("sampled_value", []):
                            val_str = str(sv.get("value", ""))
                            if sv.get("format") == "SignedData" or val_str.startswith("OCMF|"):
                                tx.ocmf_stop_raw = val_str
                                # Verify with meter key if available
                                r_key = await db.execute(
                                    select(MeterPublicKey).where(
                                        MeterPublicKey.charge_point_id == self.id,
                                        MeterPublicKey.connector_id == tx.connector_id
                                    )
                                )
                                m_key = r_key.scalar_one_or_none()
                                if m_key:
                                    v_res = verify_ocmf_signature(val_str, m_key.public_key_hex, m_key.curve_name)
                                    tx.ocmf_verified = v_res.get("verified", False)
                                    tx.ocmf_verification_error = v_res.get("error")
                                    tx.ocmf_meter_serial = v_res.get("meter_serial")
                                else:
                                    parsed_oc = parse_ocmf(val_str)
                                    tx.ocmf_meter_serial = parsed_oc.gateway_id

            # Update charger and connector status
            r_charger = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
            charger = r_charger.scalar_one_or_none()
            if charger:
                # Check if there are other active transactions
                r_active = await db.execute(
                    select(Transaction).where(
                        Transaction.charge_point_id == self.id,
                        Transaction.status == "Active",
                        Transaction.transaction_id != transaction_id,
                    )
                )
                other_active = r_active.scalars().all()
                if not other_active:
                    charger.status = "Available"

                # Update the specific connector status
                r_conn = await db.execute(
                    select(Connector).where(
                        Connector.charger_id == charger.id,
                        Connector.connector_id == stopped_connector_id,
                    )
                )
                conn = r_conn.scalar_one_or_none()
                if conn:
                    conn.status = "Available"
                    conn.updated_at = _now()

                # Add availability log
                avail = AvailabilityLog(
                    charger_id=charger.id,
                    charge_point_id=self.id,
                    connector_id=stopped_connector_id,
                    status="Available",
                    timestamp=_now(),
                )
                db.add(avail)
                await db.commit()

                # Email notification for DC charging or transaction stop
                if tx and tx.id_tag:
                    try:
                        r_user = await db.execute(select(User).where(User.rfid_tag == tx.id_tag))
                        driver_user = r_user.scalar_one_or_none()
                        if driver_user and driver_user.email:
                            m = (charger.model or "").upper()
                            v = (charger.vendor or "").upper()
                            cpid = (charger.charge_point_id or "").upper()
                            is_dc = "SICHARGE" in m or " DC" in m or m.endswith("-D") or "DC" in v or "DC" in cpid
                            
                            if is_dc:
                                kwh = max(0, (meter_stop or 0) - (tx.meter_start or 0)) / 1000.0
                                st_str = tx.start_time.strftime("%d/%m/%Y %H:%M") if tx.start_time else "—"
                                et_str = tx.stop_time.strftime("%d/%m/%Y %H:%M") if tx.stop_time else _now().strftime("%d/%m/%Y %H:%M")
                                notify_dc_charging_completed(
                                    to_email=driver_user.email,
                                    username=driver_user.username,
                                    charge_point_id=self.id,
                                    connector_id=stopped_connector_id,
                                    transaction_id=transaction_id,
                                    kwh=kwh,
                                    start_time_str=st_str,
                                    stop_time_str=et_str,
                                    stop_reason=reason,
                                )
                    except Exception as e:
                        logger.error(f"Error checking email notification on StopTransaction: {e}")

        await event_bus.publish("transaction_stopped", {
            "charge_point_id": self.id,
            "transaction_id": transaction_id,
            "connector_id": stopped_connector_id,
            "meter_stop": meter_stop,
            "reason": reason,
        })
        await event_bus.publish("status_notification", {
            "charge_point_id": self.id,
            "connector_id": stopped_connector_id,
            "status": "Available",
            "error_code": "NoError",
        })
        return call_result.StopTransactionPayload(id_tag_info={"status": AuthorizationStatus.accepted})

    @on(Action.MeterValues)
    async def on_meter_values(self, connector_id, meter_value, **kwargs):
        tx_id_ocpp = kwargs.get("transaction_id")
        await self._log_message("IN", "MeterValues", {
            "connector_id": connector_id,
            "transaction_id": tx_id_ocpp,
            "meter_value": meter_value,
            **kwargs,
        })
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
                        # Parse value as float first, then convert to appropriate type
                        val_raw = sv.get("value", "0")
                        if not val_raw or str(val_raw).strip() == "":
                            val = 0.0
                        else:
                            val = float(val_raw)
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Failed to parse meter value: {sv.get('value')} - {e}")
                        val = 0.0
                    
                    row = MeterValue(
                        transaction_id=db_tx_id or (tx_id_ocpp or 0),
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

                    # Auto-reconcile ghost transactions: if connector is Available or Unavailable, close active TX
                    if status in ["Available", "Unavailable"]:
                        r_dangling = await db.execute(
                            select(Transaction).where(
                                Transaction.charge_point_id == self.id,
                                Transaction.connector_id == connector_id,
                                Transaction.status == "Active"
                            )
                        )
                        for d_tx in r_dangling.scalars().all():
                            d_tx.status = "Completed"
                            d_tx.stop_time = d_tx.stop_time or _now()
                            d_tx.stop_reason = d_tx.stop_reason or "EVDisconnected"


                    # Sync overall charger status
                    r_all_conn = await db.execute(select(Connector).where(Connector.charger_id == charger.id))
                    all_conns = r_all_conn.scalars().all()
                    if any(c.status == "Charging" for c in all_conns):
                        charger.status = "Charging"
                    elif any(c.status == "Faulted" for c in all_conns):
                        charger.status = "Faulted"
                    else:
                        charger.status = status

                charger.last_seen = _now()

                avail = AvailabilityLog(
                    charger_id=charger.id,
                    charge_point_id=self.id,
                    connector_id=connector_id,
                    status=status,
                    error_code=error_code if error_code != "NoError" else None,
                    timestamp=_now(),
                )
                db.add(avail)
                await db.commit()

        await event_bus.publish("status_notification", {
            "charge_point_id": self.id,
            "connector_id": connector_id,
            "status": status,
            "error_code": error_code,
        })

        # Email notification for AC charging when reaching SuspendedEV (battery full)
        if status == "SuspendedEV":
            try:
                async with AsyncSessionLocal() as email_db:
                    r_tx = await email_db.execute(
                        select(Transaction)
                        .where(
                            Transaction.charge_point_id == self.id,
                            Transaction.connector_id == connector_id,
                            Transaction.status == "Active"
                        )
                        .order_by(Transaction.start_time.desc())
                        .limit(1)
                    )
                    active_tx = r_tx.scalar_one_or_none()
                    if active_tx and active_tx.id_tag:
                        r_user = await email_db.execute(select(User).where(User.rfid_tag == active_tx.id_tag))
                        driver_user = r_user.scalar_one_or_none()
                        if driver_user and driver_user.email:
                            r_mv = await email_db.execute(
                                select(MeterValue)
                                .where(MeterValue.transaction_id == active_tx.transaction_id)
                                .order_by(MeterValue.timestamp.desc())
                                .limit(5)
                            )
                            mvs = r_mv.scalars().all()
                            latest_e = active_tx.meter_start or 0
                            for mv in mvs:
                                if mv.measurand and 'energy' in mv.measurand.lower():
                                    latest_e = float(mv.value)
                                    break
                            kwh = max(0, latest_e - (active_tx.meter_start or 0)) / 1000.0
                            st_str = active_tx.start_time.strftime("%d/%m/%Y %H:%M") if active_tx.start_time else "—"
                            notify_ac_suspended_ev(
                                to_email=driver_user.email,
                                username=driver_user.username,
                                charge_point_id=self.id,
                                connector_id=connector_id,
                                transaction_id=active_tx.transaction_id,
                                kwh=kwh,
                                start_time_str=st_str,
                            )
            except Exception as e:
                logger.error(f"Error checking email notification on SuspendedEV: {e}")
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

    @on(Action.SignCertificate)
    async def on_sign_certificate(self, csr: str, **kwargs):
        """
        Handle CSR from charger (OCPP 1.6 Security Profile 3).
        Signs the CSR with CSMS Root CA and asynchronously responds with CertificateSigned.
        """
        await self._log_message("IN", "SignCertificate", {"csr": csr[:120] + "..." if len(csr) > 120 else csr})
        try:
            import pki
            from models.charger import ChargerCertificate
            signed_data = pki.sign_csr(csr, expected_charge_point_id=self.id)

            async with AsyncSessionLocal() as db:
                res = await db.execute(select(Charger).where(Charger.charge_point_id == self.id))
                charger = res.scalar_one_or_none()
                if charger:
                    cert_entry = ChargerCertificate(
                        charger_id=charger.id,
                        charge_point_id=self.id,
                        certificate_type="ChargePointCertificate",
                        serial_number=signed_data["serial_number"],
                        issuer_name_hash=signed_data["issuer_name_hash"],
                        issuer_key_hash=signed_data["issuer_key_hash"],
                        subject_cn=self.id,
                        issuer_cn="Canditos CSMS Root CA",
                        valid_from=datetime.fromisoformat(signed_data["valid_from"]),
                        valid_to=datetime.fromisoformat(signed_data["valid_to"]),
                        certificate_pem=signed_data["certificate_pem"],
                        status="Active",
                    )
                    db.add(cert_entry)
                    await db.commit()

            # Schedule dispatching CertificateSigned call to the charger
            asyncio.create_task(self.certificate_signed(signed_data["certificate_pem"]))
            return call_result.SignCertificatePayload(status="Accepted")
        except Exception as e:
            logger.error(f"SignCertificate error for {self.id}: {e}")
            return call_result.SignCertificatePayload(status="Rejected")

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

    # ── Security Profile 3 & Certificate Management (OCPP 1.6 Security Whitepaper) ──

    async def install_certificate(self, certificate_type: str, certificate: str):
        """Install a CA root or client certificate on the charge point."""
        req = call.InstallCertificatePayload(
            certificate_type=certificate_type,
            certificate=certificate,
        )
        resp = await self.call(req)
        await self._log_message("OUT", "InstallCertificate", {
            "certificate_type": certificate_type,
            "certificate_len": len(certificate),
        })
        return resp

    async def get_installed_certificate_ids(self, certificate_type: str):
        """Query installed certificates on the charge point."""
        req = call.GetInstalledCertificateIdsPayload(
            certificate_type=certificate_type,
        )
        resp = await self.call(req)
        await self._log_message("OUT", "GetInstalledCertificateIds", {
            "certificate_type": certificate_type,
        })
        return resp

    async def delete_certificate(self, certificate_hash_data: dict):
        """Delete an installed certificate from the charge point."""
        req = call.DeleteCertificatePayload(
            certificate_hash_data=certificate_hash_data,
        )
        resp = await self.call(req)
        await self._log_message("OUT", "DeleteCertificate", {
            "certificate_hash_data": certificate_hash_data,
        })
        return resp

    async def certificate_signed(self, certificate: str):
        """Send a signed X.509 certificate to the charge point in response to SignCertificate."""
        req = call.CertificateSignedPayload(
            certificate=certificate,
        )
        resp = await self.call(req)
        await self._log_message("OUT", "CertificateSigned", {
            "certificate_len": len(certificate),
        })
        return resp

