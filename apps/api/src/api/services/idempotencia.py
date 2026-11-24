"""Repetir una operacion de dinero (reintento tras perder la conexion, doble clic) no la duplica.

El navegador manda una clave por operacion. Si el servidor ya la registro, devuelve esa misma en lugar de otra; si la
misma clave llega con OTRO contenido es un error. La huella resume el contenido para poder compararlo.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pydantic import BaseModel

CAMPOS_FUERA_DE_LA_HUELLA = {"clave_idempotencia", "autorizador_usuario", "autorizador_password"}


def huella_de(payload: BaseModel, **extra: Any) -> str:
    """Resumen estable del contenido de la peticion (sin la clave ni credenciales)."""
    contenido = payload.model_dump(exclude=CAMPOS_FUERA_DE_LA_HUELLA, mode="json")
    contenido.update(extra)
    for lista in [v for v in contenido.values() if isinstance(v, list) and all(isinstance(i, dict) for i in v)]:
        lista.sort(key=lambda item: json.dumps(item, sort_keys=True))
    return hashlib.sha256(json.dumps(contenido, sort_keys=True, default=str).encode("utf-8")).hexdigest()
