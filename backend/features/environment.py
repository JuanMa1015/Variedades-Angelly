"""Configuracion global de Behave para el proyecto backend."""

from __future__ import annotations

import sys
from pathlib import Path


def _ensure_backend_path() -> Path:
    """Inserta el directorio backend en ``sys.path`` si no existe."""
    backend_root = Path(__file__).resolve().parents[1]
    backend_root_path = str(backend_root)

    if backend_root_path not in sys.path:
        sys.path.insert(0, backend_root_path)

    return backend_root


# Behave importa este modulo antes de cargar steps; por eso se inyecta el path aqui.
BACKEND_ROOT = _ensure_backend_path()


def before_all(context) -> None:
    """Prepara el path para importar modulos de src en todos los escenarios."""
    context.backend_root = BACKEND_ROOT
