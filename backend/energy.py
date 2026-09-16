"""Helpers for converting OCPP energy readings to the database's Wh convention."""


def to_watt_hours(value: float, unit: str | None) -> float:
    normalized_unit = (unit or "Wh").strip().lower()
    if normalized_unit in {"kwh", "kw h"}:
        return value * 1000.0
    if normalized_unit in {"mwh", "mw h"}:
        return value * 1_000_000.0
    return value


def to_watts(value: float, unit: str | None) -> float:
    normalized_unit = (unit or "W").strip().lower()
    if normalized_unit == "kw":
        return value * 1000.0
    if normalized_unit == "mw":
        return value * 1_000_000.0
    return value


def delta_kwh(start_wh: float | None, end_value: float, end_unit: str | None = "Wh") -> float:
    end_wh = to_watt_hours(end_value, end_unit)
    return round(max(0.0, end_wh - (start_wh or 0.0)) / 1000.0, 3)
