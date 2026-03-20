"""Modelos SQLAlchemy para persistencia en PostgreSQL (Neon)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base declarativa compartida por todos los modelos ORM."""


class UsuarioModel(Base):
    """Representacion persistente de un usuario del sistema."""

    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), nullable=False)


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
    telefono_whatsapp: Mapped[str | None] = mapped_column(String(25), nullable=True)
    limite_credito: Mapped[float] = mapped_column(Float, nullable=False)
    deuda_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class ClienteFidelizacionModel(Base):
    """Representacion persistente de clientes del modulo de fidelizacion."""

    __tablename__ = "clientes_fidelizacion"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    telefono_whatsapp: Mapped[str] = mapped_column(String(25), nullable=False, unique=True)
    puntos_acumulados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ClienteFiadoTiendaModel(Base):
    """Clientes fiados operativos del punto de venta (no cartera admin)."""

    __tablename__ = "clientes_fiado_tienda"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    telefono_whatsapp: Mapped[str | None] = mapped_column(String(25), nullable=True)


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
    cliente_tienda_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes_fiado_tienda.id"),
        nullable=True,
    )
    tipo_fiado: Mapped[str | None] = mapped_column(String(20), nullable=True)
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


class ProveedorModel(Base):
    """Catalogo de proveedores para ordenes de compra."""

    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    contacto: Mapped[str | None] = mapped_column(String(120), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(25), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class PedidoProveedorModel(Base):
    """Pedidos creados por operacion y enviados directo al proveedor."""

    __tablename__ = "pedidos_proveedor"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    monto_estimado: Mapped[float] = mapped_column(Float, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="enviado")
    creado_por: Mapped[str] = mapped_column(String(50), nullable=False)
    aprobado_por: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=datetime.utcnow,
    )
    fecha_resolucion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
    )


class GastoModel(Base):
    """Gastos operativos: arriendo, servicios, nomina, etc."""

    __tablename__ = "gastos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    monto: Mapped[float] = mapped_column(Float, nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=datetime.utcnow,
    )
    registrado_por: Mapped[str] = mapped_column(String(50), nullable=False)


class AbonoCarteraModel(Base):
    """Abonos aplicados a clientes de cartera para disminuir deuda."""

    __tablename__ = "abonos_cartera"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False)
    monto: Mapped[float] = mapped_column(Float, nullable=False)
    saldo_cliente: Mapped[float] = mapped_column(Float, nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=datetime.utcnow,
    )


class AuditoriaModel(Base):
    """Registro manual/administrativo de eventos para trazabilidad."""

    __tablename__ = "auditorias"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    modulo: Mapped[str] = mapped_column(String(50), nullable=False)
    entidad: Mapped[str] = mapped_column(String(80), nullable=False)
    entidad_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accion: Mapped[str] = mapped_column(String(30), nullable=False)
    detalle: Mapped[str | None] = mapped_column(String(500), nullable=True)
    usuario: Mapped[str] = mapped_column(String(50), nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=datetime.utcnow,
    )
