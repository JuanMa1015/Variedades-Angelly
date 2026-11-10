"""Formato unico de telefono para WhatsApp: solo digitos y con el indicativo de Colombia (57)."""

from __future__ import annotations

PREFIJO_PAIS = "57"
PREFIJO_BOGOTA = "601"


class TelefonoInvalido(ValueError):
    """El numero no tiene una longitud que se pueda interpretar."""


def normalizar_telefono(valor: str | None) -> str | None:
    """Devuelve el numero como ``57`` + digitos (``573001112233``), o None si viene vacio.

    - 10 digitos (celular): se antepone 57.
    - 12 digitos que ya empiezan por 57: se conservan.
    - 7 digitos (fijo de Bogota): se antepone 57601.
    Cualquier otra longitud es invalida, para no guardar numeros que WhatsApp no puede abrir.
    """
    digitos = "".join(c for c in str(valor or "") if c.isdigit())
    if not digitos:
        return None
    if len(digitos) == 12 and digitos.startswith(PREFIJO_PAIS):
        return digitos
    if len(digitos) == 10:
        return PREFIJO_PAIS + digitos
    if len(digitos) == 7:
        return PREFIJO_PAIS + PREFIJO_BOGOTA + digitos
    raise TelefonoInvalido("El WhatsApp debe tener 7 (fijo de Bogota), 10 (celular) o 12 digitos (con 57)")
