import os

from fastapi import Request
from slowapi import Limiter


def _trust_proxy_headers() -> bool:
    """Solo se confia en X-Real-IP / X-Forwarded-For si la API esta detras de nuestro proxy.

    Con la API expuesta directamente, esos headers los controla el cliente y permitirian
    evadir el limite de intentos de login. Poner ``TRUST_PROXY_HEADERS=false`` en ese caso.
    """
    return os.getenv("TRUST_PROXY_HEADERS", "true").strip().lower() not in {"0", "false", "no"}


def _get_client_ip(request: Request) -> str:
    if not _trust_proxy_headers():
        return request.client.host if request.client else "127.0.0.1"

    # X-Real-IP lo establece nuestro proxy (nginx) con la IP real del cliente.
    real_ip = request.headers.get("X-Real-IP", "").strip()
    if real_ip:
        return real_ip

    # En X-Forwarded-For el cliente puede suplantar los primeros valores;
    # el ultimo es el agregado por nuestra infraestructura de confianza.
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        trusted = forwarded.split(",")[-1].strip()
        if trusted:
            return trusted

    return request.client.host if request.client else "127.0.0.1"


def login_rate_limit() -> str:
    env = os.getenv("APP_ENV", "development").strip().lower()
    if env == "test":
        return "1000/minute"
    return os.getenv("LOGIN_RATE_LIMIT", "10/minute")


limiter = Limiter(key_func=_get_client_ip, default_limits=["100/minute"])
