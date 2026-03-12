"""Carga datos semilla para pruebas iniciales en Neon."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from src.domain.enums import RolUsuario
from src.infrastructure.database.connection import SessionLocal
from src.infrastructure.database.models import ClienteModel, ProductoModel, UsuarioModel


def seed_db() -> None:
    """Inserta registros base de usuario y cliente para pruebas manuales."""
    session = SessionLocal()
    try:
        usuario_existente = session.execute(
            select(UsuarioModel).where(UsuarioModel.username == "admin"),
        ).scalar_one_or_none()

        if usuario_existente is None:
            session.add(
                UsuarioModel(
                    username="admin",
                    email="admin@angelly.com",
                    rol=RolUsuario.ADMIN,
                    nombre_completo="Administrador General",
                    activo=True,
                ),
            )

        cliente_existente = session.execute(
            select(ClienteModel).where(ClienteModel.nombre == "Cliente Test"),
        ).scalar_one_or_none()

        if cliente_existente is None:
            session.add(
                ClienteModel(
                    nombre="Cliente Test",
                    documento="1000000000",
                    limite_credito=60000.0,
                    deuda_total=0.0,
                ),
            )
        elif not cliente_existente.documento:
            cliente_existente.documento = "1000000000"

        if cliente_existente is not None and cliente_existente.deuda_total < 0:
            cliente_existente.deuda_total = 0.0

        arroz = session.execute(
            select(ProductoModel).where(ProductoModel.nombre == "Arroz Diana 500g"),
        ).scalar_one_or_none()
        if arroz is None:
            session.add(
                ProductoModel(
                    nombre="Arroz Diana 500g",
                    precio_costo=2800.0,
                    precio_venta=3500.0,
                    stock_actual=40,
                    stock_minimo=10,
                ),
            )

        leche = session.execute(
            select(ProductoModel).where(ProductoModel.nombre == "Leche Entera 1L"),
        ).scalar_one_or_none()
        if leche is None:
            session.add(
                ProductoModel(
                    nombre="Leche Entera 1L",
                    precio_costo=3000.0,
                    precio_venta=3900.0,
                    stock_actual=8,
                    stock_minimo=10,
                ),
            )

        session.commit()
        print("Datos semilla aplicados correctamente.")
    except SQLAlchemyError as exc:
        session.rollback()
        print("Error al aplicar datos semilla.")
        print(f"Detalle tecnico: {exc}")
    finally:
        session.close()


if __name__ == "__main__":
    seed_db()
