import json
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Boolean, Text
from database import Base


class ChargingProfile(Base):
    __tablename__ = "charging_profiles"

    id = Column(Integer, primary_key=True, index=True)
    charge_point_id = Column(String(64), nullable=False, index=True)
    connector_id = Column(Integer, default=0)          # 0 = all connectors
    profile_id = Column(Integer, nullable=False)
    stack_level = Column(Integer, default=0)
    purpose = Column(String(64), nullable=False)       # TxDefaultProfile | ChargePointMaxProfile
    kind = Column(String(32), default="Relative")      # Absolute | Relative | Recurring
    limit_amps = Column(Integer, nullable=False)       # primary control value
    duration = Column(Integer, nullable=True)          # seconds, null = unlimited
    schedule_json = Column(Text, nullable=True)        # full JSON schedule for advanced use
    label = Column(String(128), nullable=True)         # human label e.g. "Economia Noturna"
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def schedule_dict(self):
        if self.schedule_json:
            return json.loads(self.schedule_json)
        return None
