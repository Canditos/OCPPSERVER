from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String
from database import Base


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    id_tag = Column(String(128), unique=True, nullable=False)
    name = Column(String(128), nullable=False)
    type = Column(String(32), nullable=False)
    status = Column(String(32), default="Accepted")
    expiry_date = Column(DateTime, nullable=True)
    note = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
