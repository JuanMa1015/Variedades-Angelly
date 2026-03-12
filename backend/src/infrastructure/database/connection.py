"""Configuracion de conexion SQLAlchemy para Neon PostgreSQL."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def _resolve_dotenv_path() -> Path | None:
    """Busca un archivo .env en backend o en la raiz del proyecto."""
    current_file = Path(__file__).resolve()
    project_root = current_file.parents[4]
    backend_root = current_file.parents[3]

    for candidate in (project_root / ".env", backend_root / ".env"):
        if candidate.exists():
            return candidate
    return None


def _normalize_database_url(raw_url: str) -> str:
    """Asegura driver psycopg cuando la URL viene como postgresql://."""
    if raw_url.startswith("postgresql+psycopg://"):
        return raw_url
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


def _load_database_url() -> str:
    """Carga DATABASE_URL desde variables de entorno o archivo .env."""
    dotenv_path = _resolve_dotenv_path()
    if dotenv_path is not None:
        load_dotenv(dotenv_path=dotenv_path, override=False)

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL no esta definido. Configuralo en .env o en el entorno.",
        )
    return _normalize_database_url(database_url)


DATABASE_URL: str = _load_database_url()

engine: Engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=Session,
)


def get_db() -> Iterator[Session]:
    """Entrega una sesion por request para inyeccion de dependencias."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
