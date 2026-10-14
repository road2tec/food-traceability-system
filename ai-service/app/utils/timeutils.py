from datetime import datetime, timezone


def to_utc(dt: datetime) -> datetime:
    """Naive datetimes are interpreted as UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_z(dt: datetime) -> str:
    return to_utc(dt).strftime("%Y-%m-%dT%H:%M:%S.") + f"{to_utc(dt).microsecond // 1000:03d}Z"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
