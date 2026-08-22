import json
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Float, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class ChargingProfile(Base):
    __tablename__ = "charging_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    charge_point_id: Mapped[str] = mapped_column(String(64), index=True)
    connector_id: Mapped[int] = mapped_column(Integer, default=0)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    stack_level: Mapped[int] = mapped_column(Integer, default=0)
    purpose: Mapped[str] = mapped_column(String(64), default="TxDefaultProfile")
    kind: Mapped[str] = mapped_column(String(32), default="Recurring")  # Recurring, Absolute, Relative
    recurrency_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)  # Daily, Weekly
    limit_amps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    charging_rate_unit: Mapped[str] = mapped_column(String(8), default="A")
    min_charging_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_schedule: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    periods_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    schedule_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_deployed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def schedule_dict(self):
        json_str = self.periods_json or self.schedule_json
        if json_str:
            try:
                return json.loads(json_str)
            except Exception:
                return None
        return None

    def to_ocpp_dict(self) -> dict:
        """Format as OCPP 1.6 csChargingProfiles dict payload."""
        raw_periods = self.schedule_dict() or []
        schedule_periods = []
        for p in raw_periods:
            period_dict = {
                "startPeriod": int(p.get("start_period", p.get("startPeriod", 0))),
                "limit": float(p.get("limit", 16.0)),
            }
            if p.get("number_phases") or p.get("numberPhases"):
                period_dict["numberPhases"] = int(p.get("number_phases") or p.get("numberPhases"))
            schedule_periods.append(period_dict)

        if not schedule_periods:
            schedule_periods = [{"startPeriod": 0, "limit": float(self.limit_amps or 16.0)}]

        charging_schedule = {
            "chargingRateUnit": self.charging_rate_unit or "A",
            "chargingSchedulePeriod": schedule_periods,
        }
        if self.duration:
            charging_schedule["duration"] = int(self.duration)
        if self.start_schedule:
            charging_schedule["startSchedule"] = self.start_schedule.isoformat() + "Z"
        if self.min_charging_rate is not None:
            charging_schedule["minChargingRate"] = float(self.min_charging_rate)

        cs_profile = {
            "chargingProfileId": int(self.profile_id),
            "stackLevel": int(self.stack_level),
            "chargingProfilePurpose": self.purpose,
            "chargingProfileKind": self.kind,
            "chargingSchedule": charging_schedule,
        }

        if self.recurrency_kind:
            cs_profile["recurrencyKind"] = self.recurrency_kind
        if self.valid_from:
            cs_profile["validFrom"] = self.valid_from.isoformat() + "Z"
        if self.valid_to:
            cs_profile["validTo"] = self.valid_to.isoformat() + "Z"

        return cs_profile


# Backwards compatibility alias
ChargingProfileModel = ChargingProfile
