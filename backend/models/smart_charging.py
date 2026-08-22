import json
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Float, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class ChargingProfileModel(Base):
    __tablename__ = "charging_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    charge_point_id: Mapped[str] = mapped_column(String(64), index=True)
    connector_id: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(128))
    stack_level: Mapped[int] = mapped_column(Integer, default=0)
    purpose: Mapped[str] = mapped_column(String(32))  # ChargePointMaxProfile, TxDefaultProfile, TxProfile
    kind: Mapped[str] = mapped_column(String(32))     # Recurring, Absolute, Relative
    recurrency_kind: Mapped[str | None] = mapped_column(String(16))  # Daily, Weekly
    valid_from: Mapped[datetime | None] = mapped_column(DateTime)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime)
    duration: Mapped[int | None] = mapped_column(Integer)
    start_schedule: Mapped[datetime | None] = mapped_column(DateTime)
    charging_rate_unit: Mapped[str] = mapped_column(String(8), default="A")  # A, W
    min_charging_rate: Mapped[float | None] = mapped_column(Float)
    periods_json: Mapped[str] = mapped_column(Text, default="[]")
    is_deployed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_ocpp_dict(self) -> dict:
        """Format as OCPP 1.6 csChargingProfiles dict payload."""
        periods = json.loads(self.periods_json or "[]")
        schedule_periods = []
        for p in periods:
            period_dict = {
                "startPeriod": int(p.get("start_period", 0)),
                "limit": float(p.get("limit", 16.0)),
            }
            if p.get("number_phases"):
                period_dict["numberPhases"] = int(p["number_phases"])
            schedule_periods.append(period_dict)

        charging_schedule = {
            "chargingRateUnit": self.charging_rate_unit,
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
