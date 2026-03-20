"""Carga datos semilla para pruebas iniciales en Neon."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from src.auth.bootstrap import ensure_default_auth_users
from src.infrastructure.database.connection import SessionLocal
from src.infrastructure.database.models import (
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    ClienteModel,
    ProductoModel,
    ProveedorModel,
)


def seed_db() -> None:
    """Inserta registros base de usuario y cliente para pruebas manuales."""
    session = SessionLocal()
    try:
        ensure_default_auth_users(session)

        cliente_existente = session.execute(
            select(ClienteModel).where(ClienteModel.nombre == "Cliente Test"),
        ).scalar_one_or_none()

        if cliente_existente is None:
            session.add(
                ClienteModel(
                    nombre="Cliente Test",
                    documento="1000000000",
                    telefono_whatsapp="3001112233",
                    limite_credito=60000.0,
                    deuda_total=0.0,
                ),
            )
        elif not cliente_existente.documento:
            cliente_existente.documento = "1000000000"

        if cliente_existente is not None and not cliente_existente.telefono_whatsapp:
            cliente_existente.telefono_whatsapp = "3001112233"

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

        clientes_fidelizacion_seed = (
            {
                "nombre": "Lina Rojas",
                "telefono_whatsapp": "3001234567",
                "puntos_acumulados": 120,
            },
            {
                "nombre": "Camilo Perez",
                "telefono_whatsapp": "3012345678",
                "puntos_acumulados": 65,
            },
            {
                "nombre": "Monica Salazar",
                "telefono_whatsapp": "3023456789",
                "puntos_acumulados": 180,
            },
        )

        for item in clientes_fidelizacion_seed:
            existente = session.execute(
                select(ClienteFidelizacionModel).where(
                    ClienteFidelizacionModel.telefono_whatsapp
                    == item["telefono_whatsapp"],
                ),
            ).scalar_one_or_none()
            if existente is None:
                session.add(
                    ClienteFidelizacionModel(
                        nombre=item["nombre"],
                        telefono_whatsapp=item["telefono_whatsapp"],
                        puntos_acumulados=item["puntos_acumulados"],
                    ),
                )

        clientes_fiado_tienda_seed = (
            {
                "nombre": "Fiado Tienda 1",
                "telefono_whatsapp": "3008889900",
            },
            {
                "nombre": "Fiado Tienda 2",
                "telefono_whatsapp": "3017776655",
            },
        )

        for item in clientes_fiado_tienda_seed:
            existente = session.execute(
                select(ClienteFiadoTiendaModel).where(
                    ClienteFiadoTiendaModel.nombre == item["nombre"],
                ),
            ).scalar_one_or_none()
            if existente is None:
                session.add(
                    ClienteFiadoTiendaModel(
                        nombre=item["nombre"],
                        telefono_whatsapp=item["telefono_whatsapp"],
                    ),
                )

        proveedores_seed = (
            {
                "nombre": "Distribuciones La Central",
                "contacto": "Diana",
                "telefono": "3101002000",
            },
            {
                "nombre": "Mayorista El Bodegon",
                "contacto": "Carlos",
                "telefono": "3112003000",
            },
        )

        for item in proveedores_seed:
            existente = session.execute(
                select(ProveedorModel).where(ProveedorModel.nombre == item["nombre"]),
            ).scalar_one_or_none()
            if existente is None:
                session.add(
                    ProveedorModel(
                        nombre=item["nombre"],
                        contacto=item["contacto"],
                        telefono=item["telefono"],
                        activo=True,
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
