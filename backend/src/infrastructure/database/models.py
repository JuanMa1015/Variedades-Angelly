"""Modelos SQLAlchemy para persistencia en PostgreSQL (Neon)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from src.domain.enums import RolUsuario


class Base(DeclarativeBase):
    """Base declarativa compartida por todos los modelos ORM."""


class UsuarioModel(Base):
    """Representacion persistente de un usuario del sistema."""

    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    rol: Mapped[RolUsuario] = mapped_column(
        SAEnum(RolUsuario, name="rol_usuario"),
        nullable=False,
    )
    nombre_completo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    fecha_registro: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=datetime.utcnow,
    )


class ClienteModel(Base):
    """Representacion persistente de un cliente con cupo de credito."""

    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    documento: Mapped[str | None] = mapped_column(
        String(30),
        unique=True,
        nullable=True,
    )
    limite_credito: Mapped[float] = mapped_column(Float, nullable=False)
    deuda_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class ProductoModel(Base):
    """Representacion persistente del inventario de productos."""

    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    precio_costo: Mapped[float] = mapped_column(Float, nullable=False)
    precio_venta: Mapped[float] = mapped_column(Float, nullable=False)
    stock_actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class VentaModel(Base):
    """Representacion persistente de una venta."""

    __tablename__ = "ventas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True)
    es_fiado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    saldo_pendiente: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=datetime.utcnow,
    )


class DetalleVentaModel(Base):
    """Representacion persistente del detalle de una venta."""

    __tablename__ = "detalle_ventas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    venta_id: Mapped[int] = mapped_column(ForeignKey("ventas.id"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), nullable=False)
    nombre_producto: Mapped[str] = mapped_column(String(120), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Float, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
