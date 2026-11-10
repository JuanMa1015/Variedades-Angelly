"""Descarga de imagenes desde una URL externa, protegida contra SSRF.

Pegar una URL hace que el *servidor* pida esa direccion. Sin controles, alguien podria usarlo para
leer servicios internos (localhost, la red privada, los metadatos de la nube). Por eso:

- solo http/https, sin credenciales en la URL y solo en los puertos 80 y 443;
- el nombre se resuelve y TODAS las direcciones deben ser publicas (nada privado, loopback,
  link-local, CGNAT, reservado ni IPv4 mapeado en IPv6);
- no se siguen redirecciones automaticamente: cada salto se valida de nuevo (maximo 3);
- tope de tamano mientras se descarga, tiempo limite y solo se acepta ``Content-Type: image/*``;
- no se envian cookies ni cabeceras de autenticacion.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import HTTPException

logger = logging.getLogger("tienda_angelly")

MAX_REDIRECCIONES = 3
PUERTOS_PERMITIDOS = {80, 443}
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
CABECERAS = {"Accept": "image/*", "User-Agent": "VariedadesAngelly-ImportarImagen/1.0"}
AYUDA = " Descarga la imagen y subela desde tu computador."


def _rechazar(detalle: str, estado: int = 400) -> HTTPException:
    return HTTPException(status_code=estado, detail=detalle + AYUDA)


def ip_es_publica(valor: str) -> bool:
    """True solo para direcciones enrutables en internet."""
    try:
        ip = ipaddress.ip_address(valor)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


async def resolver_ips(host: str, puerto: int) -> list[str]:
    """Resuelve el nombre a todas sus direcciones (separado para poder simularlo en pruebas)."""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, puerto, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise _rechazar("No se pudo encontrar esa direccion de internet.") from exc
    return sorted({info[4][0] for info in infos})


async def validar_destino(url: str) -> None:
    """Lanza 400 si la URL no es segura para que el servidor la visite."""
    partes = urlsplit(url)
    if partes.scheme not in {"http", "https"} or not partes.hostname:
        raise _rechazar("La direccion debe empezar por http:// o https://.")
    if partes.username or partes.password:
        raise _rechazar("La direccion no puede incluir usuario ni contrasena.")
    try:
        puerto = partes.port or (443 if partes.scheme == "https" else 80)
    except ValueError as exc:
        raise _rechazar("La direccion no es valida.") from exc
    if puerto not in PUERTOS_PERMITIDOS:
        raise _rechazar("Solo se permiten direcciones en los puertos web normales.")

    host = partes.hostname
    try:
        ipaddress.ip_address(host)
        ips = [host]
    except ValueError:
        ips = await resolver_ips(host, puerto)
    if not ips or not all(ip_es_publica(ip) for ip in ips):
        logger.warning("Importar imagen: destino no permitido %s -> %s", host, ips)
        raise _rechazar("Esa direccion no esta permitida.")


def _cliente_http() -> httpx.AsyncClient:
    # Sin redirecciones automaticas: cada salto se valida a mano.
    return httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False, trust_env=False)


async def _leer_cuerpo(respuesta: httpx.Response, max_bytes: int) -> bytes:
    declarado = respuesta.headers.get("content-length", "")
    if declarado.isdigit() and int(declarado) > max_bytes:
        raise _rechazar("La imagen supera los 5 MB.")
    recibido = bytearray()
    async for trozo in respuesta.aiter_bytes():
        recibido.extend(trozo)
        if len(recibido) > max_bytes:
            raise _rechazar("La imagen supera los 5 MB.")
    return bytes(recibido)


def _exigir_respuesta_de_imagen(respuesta: httpx.Response) -> None:
    if respuesta.status_code != 200:
        raise _rechazar(f"El sitio respondio con error ({respuesta.status_code}).")
    tipo = respuesta.headers.get("content-type", "").split(";")[0].strip().lower()
    if not tipo.startswith("image/"):
        raise _rechazar("Esa direccion no es una imagen.")


async def descargar_imagen(url: str, max_bytes: int) -> bytes:
    """Descarga la imagen validando cada salto. Retorna los bytes (aun sin verificar como imagen)."""
    actual = url
    try:
        async with _cliente_http() as cliente:
            for _ in range(MAX_REDIRECCIONES + 1):
                await validar_destino(actual)
                async with cliente.stream("GET", actual, headers=CABECERAS) as respuesta:
                    if respuesta.is_redirect:
                        destino = respuesta.headers.get("location")
                        if not destino:
                            raise _rechazar("El sitio redirigio sin indicar a donde.")
                        actual = urljoin(actual, destino)
                        continue
                    _exigir_respuesta_de_imagen(respuesta)
                    return await _leer_cuerpo(respuesta, max_bytes)
    except httpx.TimeoutException as exc:
        raise _rechazar("El sitio tardo demasiado en responder.", 504) from exc
    except httpx.HTTPError as exc:
        logger.warning("Importar imagen: fallo la descarga de %s: %s", url, exc)
        raise _rechazar("No se pudo descargar la imagen.", 502) from exc
    raise _rechazar("La direccion redirige demasiadas veces.")
