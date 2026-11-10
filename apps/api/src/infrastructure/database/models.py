"""Modelos SQLAlchemy para persistencia en PostgreSQL (Neon)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text, event, select, text
from sqlalchemy.sql import expression
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base declarativa compartida por todos los modelos ORM."""


def _dinero() -> Numeric:
    """Monto en pesos: NUMERIC(14,2) exacto en BD, entregado como float a la API."""
    return Numeric(14, 2, asdecimal=False)


def _utcnow_naive() -> datetime:
    """Retorna fecha UTC naive para columnas DateTime(timezone=False)."""
    return datetime.now(UTC).replace(tzinfo=None)


class UsuarioModel(Base):
    """Representacion persistente de un usuario del sistema."""

    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"UsuarioModel(id={self.id!r}, username={self.username!r})"


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
    limite_credito: Mapped[float] = mapped_column(_dinero(), nullable=False)
    deuda_total: Mapped[float] = mapped_column(_dinero(), nullable=False, default=0.0)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"ClienteModel(id={self.id!r}, nombre={self.nombre!r})"


class ClienteFidelizacionModel(Base):
    """Representacion persistente de clientes del modulo de fidelizacion."""

    __tablename__ = "clientes_fidelizacion"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    telefono_whatsapp: Mapped[str] = mapped_column(String(25), nullable=False, unique=True)
    puntos_acumulados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Autorizacion para tratar sus datos (Ley 1581 de 2012): se pide al inscribirlo.
    acepta_datos: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=expression.false(),
    )
    acepta_datos_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    def __repr__(self) -> str:
        return (
            f"ClienteFidelizacionModel(id={self.id!r}, "
            f"telefono_whatsapp={self.telefono_whatsapp!r})"
        )


class ClienteFiadoTiendaModel(Base):
    """Clientes fiados operativos del punto de venta (no cartera admin)."""

    __tablename__ = "clientes_fiado_tienda"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    telefono_whatsapp: Mapped[str | None] = mapped_column(String(25), nullable=True)
    deuda_total: Mapped[float] = mapped_column(_dinero(), nullable=False, default=0.0)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"ClienteFiadoTiendaModel(id={self.id!r}, nombre={self.nombre!r})"


class ProductoModel(Base):
    """Representacion persistente del inventario de productos."""

    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    codigo_barras: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    precio_costo: Mapped[float] = mapped_column(_dinero(), nullable=False)
    precio_venta: Mapped[float] = mapped_column(_dinero(), nullable=False)
    catalogo: Mapped[str] = mapped_column(String(20), nullable=False, default="tienda")
    stock_actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    imagen_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    proveedor_id: Mapped[int | None] = mapped_column(ForeignKey("proveedores.id"), nullable=True)
    proveedor: Mapped["ProveedorModel | None"] = relationship("ProveedorModel", foreign_keys=[proveedor_id])

    def __repr__(self) -> str:
        return f"ProductoModel(id={self.id!r}, nombre={self.nombre!r})"


class VentaModel(Base):
    """Representacion persistente de una venta."""

    __tablename__ = "ventas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    creado_por: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True)
    cliente_tienda_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes_fiado_tienda.id"),
        nullable=True,
    )
    tipo_fiado: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cliente_fidelizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes_fidelizacion.id"),
        nullable=True,
    )
    puntos_otorgados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metodo_pago: Mapped[str | None] = mapped_column(String(20), nullable=True)
    es_fiado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total: Mapped[float] = mapped_column(_dinero(), nullable=False)
    saldo_pendiente: Mapped[float] = mapped_column(_dinero(), nullable=False, default=0.0)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=_utcnow_naive,
    )

    # Turno de caja al que pertenece (se asigna solo al crear si hay una caja abierta).
    caja_id: Mapped[int | None] = mapped_column(
        ForeignKey("cierres_caja.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Una venta anulada no se borra: queda marcada con quien, cuando, por que y quien autorizo.
    anulada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=expression.false())
    anulada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    anulada_por: Mapped[str | None] = mapped_column(String(50), nullable=True)
    autorizada_por: Mapped[str | None] = mapped_column(String(50), nullable=True)
    motivo_anulacion: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Efectivo (o monto) que entrego el cliente: permite reimprimir el comprobante con su cambio real.
    monto_recibido: Mapped[float | None] = mapped_column(_dinero(), nullable=True)
    # Puntos de fidelizacion usados como descuento en esta venta y su valor en pesos.
    puntos_canjeados: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    descuento_puntos: Mapped[float] = mapped_column(_dinero(), nullable=False, default=0.0, server_default="0")

    def __repr__(self) -> str:
        return f"VentaModel(id={self.id!r}, total={self.total!r})"


class DetalleVentaModel(Base):
    """Representacion persistente del detalle de una venta."""

    __tablename__ = "detalle_ventas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    venta_id: Mapped[int] = mapped_column(ForeignKey("ventas.id"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), nullable=False)
    nombre_producto: Mapped[str] = mapped_column(String(120), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(_dinero(), nullable=False)
    subtotal: Mapped[float] = mapped_column(_dinero(), nullable=False)

    def __repr__(self) -> str:
        return (
            f"DetalleVentaModel(id={self.id!r}, "
            f"nombre_producto={self.nombre_producto!r})"
        )


class ProveedorModel(Base):
    """Catalogo de proveedores para ordenes de compra."""

    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    contacto: Mapped[str | None] = mapped_column(String(120), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(25), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    facturas_compra: Mapped[list["FacturaCompraModel"]] = relationship(
        "FacturaCompraModel",
        back_populates="proveedor",
    )

    def __repr__(self) -> str:
        return f"ProveedorModel(id={self.id!r}, nombre={self.nombre!r})"


class PedidoProveedorModel(Base):
    """Pedidos creados por operacion y enviados directo al proveedor."""

    __tablename__ = "pedidos_proveedor"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    monto_estimado: Mapped[float] = mapped_column(_dinero(), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="enviado")
    creado_por: Mapped[str] = mapped_column(String(50), nullable=False)
    aprobado_por: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=_utcnow_naive,
    )
    fecha_resolucion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"PedidoProveedorModel(id={self.id!r}, descripcion={self.descripcion!r})"


class FacturaCompraModel(Base):
    """Cabecera de facturas de compra por proveedor."""

    __tablename__ = "facturas_compra"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), nullable=False)
    creado_por: Mapped[str] = mapped_column(String(50), nullable=False)
    subtotal: Mapped[float] = mapped_column(_dinero(), nullable=False)
    total_iva: Mapped[float] = mapped_column(_dinero(), nullable=False, default=0.0)
    total_factura: Mapped[float] = mapped_column(_dinero(), nullable=False)
    numero_factura: Mapped[str | None] = mapped_column(String(20), nullable=True)
    encomienda: Mapped[float | None] = mapped_column(_dinero(), nullable=True, default=0.0)
    porcentaje_ganancia: Mapped[float | None] = mapped_column(Float, nullable=True, default=0.70)
    proveedor: Mapped["ProveedorModel"] = relationship(
        "ProveedorModel",
        back_populates="facturas_compra",
    )
    detalles: Mapped[list["FacturaCompraDetalleModel"]] = relationship(
        "FacturaCompraDetalleModel",
        back_populates="factura",
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=_utcnow_naive,
    )

    def __repr__(self) -> str:
        return f"FacturaCompraModel(id={self.id!r}, total_factura={self.total_factura!r})"


class FacturaCompraDetalleModel(Base):
    """Lineas de producto de una factura de compra."""

    __tablename__ = "factura_compra_detalles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    factura_id: Mapped[int] = mapped_column(ForeignKey("facturas_compra.id"), nullable=False)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), nullable=False)
    nombre_producto: Mapped[str] = mapped_column(String(120), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    aplica_iva: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    precio_unitario: Mapped[float] = mapped_column(_dinero(), nullable=False)
    precio_total: Mapped[float] = mapped_column(_dinero(), nullable=False)
    precio_venta_sugerido: Mapped[float | None] = mapped_column(_dinero(), nullable=True)
    ganancia_estimada: Mapped[float | None] = mapped_column(_dinero(), nullable=True)
    factura: Mapped["FacturaCompraModel"] = relationship(
        "FacturaCompraModel",
        back_populates="detalles",
    )

    def __repr__(self) -> str:
        return (
            f"FacturaCompraDetalleModel(id={self.id!r}, "
            f"nombre_producto={self.nombre_producto!r})"
        )


class GastoModel(Base):
    """Gastos operativos: arriendo, servicios, nomina, etc."""

    __tablename__ = "gastos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    monto: Mapped[float] = mapped_column(_dinero(), nullable=False)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=_utcnow_naive,
    )
    registrado_por: Mapped[str] = mapped_column(String(50), nullable=False)

    # Turno de caja al que pertenece (se asigna solo al crear si hay una caja abierta).
    caja_id: Mapped[int | None] = mapped_column(
        ForeignKey("cierres_caja.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    def __repr__(self) -> str:
        return f"GastoModel(id={self.id!r}, categoria={self.categoria!r})"


class AbonoCarteraModel(Base):
    """Abonos aplicados a clientes de cartera para disminuir deuda."""

    __tablename__ = "abonos_cartera"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False)
    monto: Mapped[float] = mapped_column(_dinero(), nullable=False)
    metodo_pago: Mapped[str | None] = mapped_column(String(20), nullable=True)
    saldo_cliente: Mapped[float] = mapped_column(_dinero(), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=_utcnow_naive,
    )

    # Turno de caja al que pertenece (se asigna solo al crear si hay una caja abierta).
    caja_id: Mapped[int | None] = mapped_column(
        ForeignKey("cierres_caja.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    def __repr__(self) -> str:
        return f"AbonoCarteraModel(id={self.id!r}, monto={self.monto!r})"


class AbonoTiendaModel(Base):
    """Abonos aplicados a clientes fiado de tienda para disminuir deuda."""

    __tablename__ = "abonos_tienda"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes_fiado_tienda.id"), nullable=False)
    monto: Mapped[float] = mapped_column(_dinero(), nullable=False)
    metodo_pago: Mapped[str | None] = mapped_column(String(20), nullable=True)
    saldo_cliente: Mapped[float] = mapped_column(_dinero(), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=_utcnow_naive,
    )

    # Turno de caja al que pertenece (se asigna solo al crear si hay una caja abierta).
    caja_id: Mapped[int | None] = mapped_column(
        ForeignKey("cierres_caja.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Un abono anulado no se borra: devuelve la deuda y queda con quien, cuando, por que y quien autorizo.
    anulado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=expression.false())
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    anulado_por: Mapped[str | None] = mapped_column(String(50), nullable=True)
    autorizado_por: Mapped[str | None] = mapped_column(String(50), nullable=True)
    motivo_anulacion: Mapped[str | None] = mapped_column(String(200), nullable=True)

    def __repr__(self) -> str:
        return f"AbonoTiendaModel(id={self.id!r}, monto={self.monto!r})"


class CierreCajaModel(Base):
    """Representacion persistente de apertura/cierre de caja."""

    __tablename__ = "cierres_caja"
    # Solo puede haber un turno abierto en toda la tienda. Es la base de datos la que lo garantiza:
    # si dos personas abren la caja a la vez, la segunda recibe un error de unicidad.
    __table_args__ = (
        Index(
            "ux_cierres_caja_un_turno_abierto",
            text("(1)"),
            unique=True,
            postgresql_where=text("fecha_cierre IS NULL"),
            sqlite_where=text("fecha_cierre IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    usuario: Mapped[str] = mapped_column(String(50), nullable=False)
    fecha_apertura: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
    )
    fecha_cierre: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
    )
    monto_inicial: Mapped[float] = mapped_column(_dinero(), nullable=False)
    monto_ventas_efectivo: Mapped[float] = mapped_column(_dinero(), nullable=False)
    monto_ventas_transferencia: Mapped[float] = mapped_column(_dinero(), nullable=False)
    monto_ventas_tarjeta: Mapped[float] = mapped_column(
        _dinero(), nullable=False, default=0.0, server_default="0",
    )
    monto_gastos: Mapped[float] = mapped_column(_dinero(), nullable=False)
    monto_efectivo_real: Mapped[float | None] = mapped_column(_dinero(), nullable=True)
    esperado_vs_real: Mapped[float | None] = mapped_column(_dinero(), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False)
    observaciones: Mapped[str | None] = mapped_column(String(500), nullable=True)
    monto_cierre: Mapped[float | None] = mapped_column(_dinero(), nullable=True)
    abierto_por: Mapped[str] = mapped_column(String(50), nullable=False)
    cerrado_por: Mapped[str | None] = mapped_column(String(50), nullable=True)

    def __repr__(self) -> str:
        return f"CierreCajaModel(id={self.id!r}, abierto_por={self.abierto_por!r})"


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
        default=_utcnow_naive,
    )

    def __repr__(self) -> str:
        return f"AuditoriaModel(id={self.id!r}, accion={self.accion!r})"


class RefreshTokenBlacklistModel(Base):
    """JTIs de refresh tokens ya utilizados (rotacion)."""

    __tablename__ = "refresh_token_blacklist"

    jti: Mapped[str] = mapped_column(Text, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        default=_utcnow_naive,
    )

    def __repr__(self) -> str:
        return f"RefreshTokenBlacklistModel(jti={self.jti!r})"


def _asignar_turno_abierto(_mapper, connection, target) -> None:
    """Al crear una venta, abono o gasto lo asocia al turno de caja abierto (si lo hay).

    Lo que ocurre con la caja cerrada queda sin turno, y las operaciones con fecha anterior a la
    apertura (p. ej. un abono registrado con fecha pasada) tampoco entran al turno actual.
    """
    if target.caja_id is not None:
        return
    abierta = connection.execute(
        select(CierreCajaModel.id, CierreCajaModel.fecha_apertura)
        .where(CierreCajaModel.fecha_cierre.is_(None))
        .order_by(CierreCajaModel.id.desc())
        .limit(1),
    ).first()
    if abierta is None:
        return
    fecha = getattr(target, "fecha", None)
    if fecha is not None:
        if fecha.tzinfo is not None:
            fecha = fecha.astimezone(UTC).replace(tzinfo=None)
        if fecha < abierta.fecha_apertura:
            return
    target.caja_id = abierta.id


for _modelo in (VentaModel, AbonoCarteraModel, AbonoTiendaModel, GastoModel):
    event.listen(_modelo, "before_insert", _asignar_turno_abierto)
