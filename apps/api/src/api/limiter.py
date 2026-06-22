import os

from fastapi import Request
from slowapi import Limiter


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def login_rate_limit() -> str:
    env = os.getenv("APP_ENV", "development").strip().lower()
    if env == "test":
        return "1000/minute"
    return os.getenv("LOGIN_RATE_LIMIT", "10/minute")


limiter = Limiter(key_func=_get_client_ip, default_limits=["100/minute"])
