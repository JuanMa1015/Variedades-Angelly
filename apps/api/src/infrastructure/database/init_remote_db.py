"""Inicializa tablas en Neon usando metadata de SQLAlchemy."""

from __future__ import annotations

from sqlalchemy.exc import OperationalError, SQLAlchemyError

from src.infrastructure.database.connection import engine
from src.infrastructure.database.models import Base


def init_remote_db() -> None:
    """Crea tablas fisicas si no existen en la base remota."""
    try:
        Base.metadata.create_all(bind=engine)
        print("Tablas creadas/verificadas correctamente en la base remota.")
    except OperationalError as exc:
        print(
            "Error de conexion al inicializar la base remota "
            "(revisa DATABASE_URL, red o SSL de Neon).",
        )
        print(f"Detalle tecnico: {exc}")
    except SQLAlchemyError as exc:
        print("Error SQLAlchemy durante la inicializacion de tablas.")
        print(f"Detalle tecnico: {exc}")


if __name__ == "__main__":
    init_remote_db()
