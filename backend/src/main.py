"""Aplicacion principal FastAPI para Variedades Angelly."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.auth.bootstrap import ensure_default_auth_users
from src.auth.security import create_access_token, decode_access_token, verify_password
from src.domain.cliente import Cliente
from src.domain.producto import Producto
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import (
    AbonoCarteraModel,
    AuditoriaModel,
    ClienteFiadoTiendaModel,
    ClienteFidelizacionModel,
    ClienteModel,
    DetalleVentaModel,
    GastoModel,
    PedidoProveedorModel,
    ProductoModel,
    ProveedorModel,
    UsuarioModel,
    VentaModel,
)
from src.infrastructure.repositories.sqlalchemy_repository import (
    SqlAlchemyClienteRepository,
    SqlAlchemyProductoRepository,
)


class ClienteResponse(BaseModel):
    """DTO de salida para el endpoint de clientes."""

    id: int
    nombre: str
    documento: str | None
    telefono_whatsapp: str | None = None
    limite_credito: float
    deuda_total: float


class ClienteCarteraPageResponse(BaseModel):
    """Respuesta paginada para listado de cartera en UI."""

    data: list[ClienteResponse]
    total_pages: int
    current_page: int


class MovimientoClienteResponse(BaseModel):
    """DTO de salida para historial paginado del cliente."""

    id: int
    tipo: str
    descripcion: str | None = None
    articulo: str | None = None
    cantidad: int | None = None
    referencia: str | None = None
    monto: float
    fecha: datetime
    saldo: float


class MovimientoClientePageResponse(BaseModel):
    """Respuesta paginada para movimientos del modal de detalle."""

    data: list[MovimientoClienteResponse]
    total_pages: int
    current_page: int


class ClienteCreateRequest(BaseModel):
    """DTO de entrada para crear clientes desde UI."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    documento: Annotated[str | None, Field(min_length=5, max_length=30)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    limite_credito: Annotated[float, Field(gt=0)]


class ClienteUpdateRequest(BaseModel):
    """DTO de entrada para editar cliente de cartera."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    documento: Annotated[str | None, Field(min_length=5, max_length=30)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None
    limite_credito: Annotated[float | None, Field(gt=0)] = None


class LoginRequest(BaseModel):
    """Credenciales de acceso para autenticacion de usuarios."""

    username: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=6, max_length=128)]


class LoginResponse(BaseModel):
    """Respuesta de autenticacion con token JWT."""

    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    expires_in: int


class AuthenticatedUser(BaseModel):
    """Representa al usuario autenticado extraido del JWT."""

    username: str
    role: str


class ClienteFidelizacionResponse(BaseModel):
    """DTO de salida para clientes del modulo de fidelizacion."""

    id: int
    nombre: str
    telefono_whatsapp: str
    puntos_acumulados: int


class ProductoResponse(BaseModel):
    """DTO de salida para consultas de inventario."""

    id: int
    nombre: str
    precio_costo: float
    precio_venta: float
    stock_actual: int
    stock_minimo: int
    stock_critico: bool


class ProductoCreateRequest(BaseModel):
    """DTO de entrada para crear productos nuevos."""

    nombre: Annotated[str, Field(min_length=2, max_length=120)]
    precio_costo: Annotated[float, Field(ge=0)]
    precio_venta: Annotated[float, Field(ge=0)]
    stock_actual: Annotated[int, Field(ge=0)] = 0
    stock_minimo: Annotated[int, Field(ge=0)] = 0


class ProductoUpdateRequest(BaseModel):
    """DTO para edición administrativa de producto."""

    nombre: Annotated[str | None, Field(min_length=2, max_length=120)] = None
    precio_costo: Annotated[float | None, Field(ge=0)] = None
    precio_venta: Annotated[float | None, Field(ge=0)] = None
    stock_actual: Annotated[int | None, Field(ge=0)] = None
    stock_minimo: Annotated[int | None, Field(ge=0)] = None


class ProductoStockPatchRequest(BaseModel):
    """DTO para ajustes rapidos de stock por delta."""

    delta: Annotated[int, Field(ne=0)]


class ProductoPrecioPatchRequest(BaseModel):
    """DTO para edicion inline de precio de venta."""

    precio_venta: Annotated[float, Field(ge=0)]


class VentaItemCreateRequest(BaseModel):
    """DTO de cada item a vender."""

    producto_id: Annotated[int, Field(gt=0)]
    cantidad: Annotated[int, Field(gt=0)]


class VentaCreateRequest(BaseModel):
    """DTO de entrada para registrar ventas."""

    cliente_id: Annotated[int | None, Field(gt=0)] = None
    cliente_tienda_id: Annotated[int | None, Field(gt=0)] = None
    items: Annotated[list[VentaItemCreateRequest], Field(min_length=1)]
    es_fiado: bool = False
    fiado_origen: str | None = None


class VentaUpdateRequest(BaseModel):
    """Entrada administrativa para editar una venta existente."""

    cliente_id: Annotated[int | None, Field(gt=0)] = None
    cliente_tienda_id: Annotated[int | None, Field(gt=0)] = None
    es_fiado: bool | None = None
    fiado_origen: str | None = None
    total: Annotated[float | None, Field(ge=0)] = None
    saldo_pendiente: Annotated[float | None, Field(ge=0)] = None


class CarteraVentaCreateRequest(BaseModel):
    """Entrada para registrar una venta en el libro de cartera admin."""

    cliente_id: Annotated[int, Field(gt=0)]
    items: Annotated[list[VentaItemCreateRequest], Field(min_length=1)]
    abono_inicial: Annotated[float, Field(ge=0)] = 0
    fecha_venta: datetime | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class VentaDetalleResponse(BaseModel):
    """DTO de salida para lineas de una venta."""

    producto_id: int
    nombre_producto: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class VentaResponse(BaseModel):
    """DTO de salida para venta creada."""

    venta_id: int
    cliente_id: int | None
    cliente_tienda_id: int | None
    cliente_nombre: str | None
    es_fiado: bool
    fiado_origen: str | None
    total: float
    saldo_pendiente: float
    fecha: datetime
    detalles: list[VentaDetalleResponse]
    resumen_recibo: str


class ClienteFiadoTiendaResponse(BaseModel):
    """DTO para clientes fiados operativos de tienda."""

    id: int
    nombre: str
    telefono_whatsapp: str | None


class ClienteFiadoTiendaCreateRequest(BaseModel):
    """Entrada para crear clientes fiados de tienda."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None


class ClienteFiadoTiendaUpdateRequest(BaseModel):
    """Entrada para editar cliente fiado operativo de tienda."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(max_length=25)] = None


class ProveedorResponse(BaseModel):
    """DTO de salida para proveedores."""

    id: int
    nombre: str
    contacto: str | None
    telefono: str | None
    activo: bool


class ProveedorCreateRequest(BaseModel):
    """DTO de entrada para alta de proveedores."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    contacto: Annotated[str | None, Field(max_length=120)] = None
    telefono: Annotated[str | None, Field(max_length=25)] = None


class ProveedorUpdateRequest(BaseModel):
    """Entrada para editar proveedor."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    contacto: Annotated[str | None, Field(max_length=120)] = None
    telefono: Annotated[str | None, Field(max_length=25)] = None
    activo: bool | None = None


class PedidoProveedorResponse(BaseModel):
    """DTO de salida para pedidos a proveedor."""

    id: int
    proveedor_id: int
    proveedor_nombre: str
    descripcion: str
    monto_estimado: float
    estado: str
    creado_por: str
    aprobado_por: str | None
    fecha_creacion: datetime
    fecha_resolucion: datetime | None


class PedidoProveedorCreateRequest(BaseModel):
    """DTO de entrada para crear un pedido a proveedor."""

    proveedor_id: Annotated[int, Field(gt=0)]
    descripcion: Annotated[str, Field(min_length=4, max_length=255)]
    monto_estimado: Annotated[float, Field(gt=0)]


class PedidoProveedorUpdateRequest(BaseModel):
    """Entrada para editar pedido a proveedor."""

    descripcion: Annotated[str | None, Field(min_length=4, max_length=255)] = None
    monto_estimado: Annotated[float | None, Field(gt=0)] = None


class GastoResponse(BaseModel):
    """DTO de salida para gastos operativos."""

    id: int
    categoria: str
    descripcion: str
    monto: float
    fecha: datetime
    registrado_por: str


class GastoCreateRequest(BaseModel):
    """DTO de entrada para registrar un gasto."""

    categoria: Annotated[str, Field(min_length=3, max_length=50)]
    descripcion: Annotated[str, Field(min_length=4, max_length=255)]
    monto: Annotated[float, Field(gt=0)]


class GastoUpdateRequest(BaseModel):
    """Entrada para editar gasto operativo."""

    categoria: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    descripcion: Annotated[str | None, Field(min_length=4, max_length=255)] = None
    monto: Annotated[float | None, Field(gt=0)] = None


class ClienteFidelizacionCreateRequest(BaseModel):
    """Entrada para crear cliente de fidelizacion."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str, Field(min_length=7, max_length=25)]
    puntos_acumulados: Annotated[int, Field(ge=0)] = 0


class ClienteFidelizacionUpdateRequest(BaseModel):
    """Entrada para editar cliente de fidelizacion."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(min_length=7, max_length=25)] = None
    puntos_acumulados: Annotated[int | None, Field(ge=0)] = None


class AbonoCarteraCreateRequest(BaseModel):
    """Entrada para registrar abonos a deuda de cartera."""

    monto: Annotated[float, Field(gt=0)]
    fecha: datetime | None = None
    referencia: Annotated[str | None, Field(max_length=255)] = None


class AbonoCarteraResponse(BaseModel):
    """Salida de abonos registrados en cartera."""

    id: int
    cliente_id: int
    monto: float
    saldo_cliente: float
    referencia: str | None
    fecha: datetime


class AuditoriaResponse(BaseModel):
    """Salida para registros de auditoria administrativa."""

    id: int
    modulo: str
    entidad: str
    entidad_id: int | None
    accion: str
    detalle: str | None
    usuario: str
    fecha: datetime


class AuditoriaCreateRequest(BaseModel):
    """Entrada para registrar evento en tabla de auditorias."""

    modulo: Annotated[str, Field(min_length=2, max_length=50)]
    entidad: Annotated[str, Field(min_length=2, max_length=80)]
    entidad_id: Annotated[int | None, Field(gt=0)] = None
    accion: Annotated[str, Field(min_length=2, max_length=30)]
    detalle: Annotated[str | None, Field(max_length=500)] = None


class AuditoriaUpdateRequest(BaseModel):
    """Entrada para editar auditoria existente."""

    modulo: Annotated[str | None, Field(min_length=2, max_length=50)] = None
    entidad: Annotated[str | None, Field(min_length=2, max_length=80)] = None
    entidad_id: Annotated[int | None, Field(gt=0)] = None
    accion: Annotated[str | None, Field(min_length=2, max_length=30)] = None
    detalle: Annotated[str | None, Field(max_length=500)] = None


class DashboardResumenResponse(BaseModel):
    """Resumen ejecutivo de ventas para dashboard inicial."""

    ventas_diarias: float
    ventas_semanales: float
    ventas_mensuales: float
    transacciones_diarias: int
    transacciones_semanales: int
    transacciones_mensuales: int


def _to_detalle_response(detalle: DetalleVentaModel) -> VentaDetalleResponse:
    """Convierte detalle persistido a DTO HTTP."""
    return VentaDetalleResponse(
        producto_id=detalle.producto_id,
        nombre_producto=detalle.nombre_producto,
        cantidad=detalle.cantidad,
        precio_unitario=detalle.precio_unitario,
        subtotal=detalle.subtotal,
    )


def _to_cliente_response(cliente: Cliente) -> ClienteResponse:
    """Convierte entidad de dominio a contrato HTTP."""
    return ClienteResponse(
        id=cliente.id or 0,
        nombre=cliente.nombre,
        documento=cliente.documento,
        telefono_whatsapp=getattr(cliente, "telefono_whatsapp", None),
        limite_credito=cliente.limite_credito,
        deuda_total=cliente.deuda_total,
    )


def _to_cliente_model_response(cliente: ClienteModel) -> ClienteResponse:
    """Convierte modelo SQL de cliente a contrato HTTP."""
    return ClienteResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        documento=cliente.documento,
        telefono_whatsapp=cliente.telefono_whatsapp,
        limite_credito=cliente.limite_credito,
        deuda_total=cliente.deuda_total,
    )


def _to_producto_response(producto: Producto) -> ProductoResponse:
    """Convierte entidad de producto a contrato HTTP."""
    return ProductoResponse(
        id=producto.id or 0,
        nombre=producto.nombre,
        precio_costo=producto.precio_costo,
        precio_venta=producto.precio_venta,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
        stock_critico=producto.stock_critico,
    )


def _to_proveedor_response(proveedor: ProveedorModel) -> ProveedorResponse:
    """Convierte proveedor persistido a DTO HTTP."""
    return ProveedorResponse(
        id=proveedor.id,
        nombre=proveedor.nombre,
        contacto=proveedor.contacto,
        telefono=proveedor.telefono,
        activo=proveedor.activo,
    )


def _to_pedido_proveedor_response(
    pedido: PedidoProveedorModel,
    proveedor_nombre: str,
) -> PedidoProveedorResponse:
    """Mapea pedido de proveedor a respuesta API."""
    return PedidoProveedorResponse(
        id=pedido.id,
        proveedor_id=pedido.proveedor_id,
        proveedor_nombre=proveedor_nombre,
        descripcion=pedido.descripcion,
        monto_estimado=pedido.monto_estimado,
        estado=pedido.estado,
        creado_por=pedido.creado_por,
        aprobado_por=pedido.aprobado_por,
        fecha_creacion=pedido.fecha_creacion,
        fecha_resolucion=pedido.fecha_resolucion,
    )


def _to_abono_response(abono: AbonoCarteraModel) -> AbonoCarteraResponse:
    """Convierte abono de cartera persistido a DTO HTTP."""
    return AbonoCarteraResponse(
        id=abono.id,
        cliente_id=abono.cliente_id,
        monto=abono.monto,
        saldo_cliente=abono.saldo_cliente,
        referencia=abono.referencia,
        fecha=abono.fecha,
    )


def _to_auditoria_response(auditoria: AuditoriaModel) -> AuditoriaResponse:
    """Convierte auditoria persistida a respuesta API."""
    return AuditoriaResponse(
        id=auditoria.id,
        modulo=auditoria.modulo,
        entidad=auditoria.entidad,
        entidad_id=auditoria.entidad_id,
        accion=auditoria.accion,
        detalle=auditoria.detalle,
        usuario=auditoria.usuario,
        fecha=auditoria.fecha,
    )


def _ventas_metric_since(db: Session, start_date: datetime) -> tuple[float, int]:
    """Retorna total y cantidad de ventas desde una fecha dada."""
    total, count = db.execute(
        select(
            func.coalesce(func.sum(VentaModel.total), 0.0),
            func.count(VentaModel.id),
        ).where(VentaModel.fecha >= start_date),
    ).one()
    return float(total or 0.0), int(count or 0)


def _build_recibo_text(
    venta_id: int,
    detalles: list[VentaDetalleResponse],
    total: float,
    saldo_pendiente: float,
    cliente_nombre: str | None,
) -> str:
    """Construye resumen textual para mostrar o enviar por WhatsApp."""
    lineas = ", ".join(
        f"{detalle.cantidad} {detalle.nombre_producto} (${int(detalle.subtotal)})"
        for detalle in detalles
    )
    cliente_label = cliente_nombre or "Mostrador"
    detalle_label = lineas or "Sin productos"
    return (
        f"Variedades Angelly - Recibo #{venta_id}: Cliente: {cliente_label}. {detalle_label}. "
        f"Total: ${int(total)}. Saldo pendiente: ${int(saldo_pendiente)}"
    )


app = FastAPI(title="Variedades Angelly API", version="0.1.0")
security_scheme = HTTPBearer(auto_error=False)
FIDELIZACION_UMBRAL_BONO = 100
FIADO_ORIGEN_CARTERA = "cartera"
FIADO_ORIGEN_TIENDA = "tienda"
PEDIDO_ESTADO_ENVIADO = "enviado"


def _normalize_naive_datetime(value: datetime | None) -> datetime | None:
    """Normaliza datetime removiendo tzinfo para columnas naive en BD."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.replace(tzinfo=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _normalize_role(role_value: object) -> str:
    normalized = str(role_value or "").lower().strip()
    if normalized == "admin":
        return "admin"
    if normalized == "vendedor":
        return "vendedor"
    return ""


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_scheme),
) -> AuthenticatedUser:
    """Valida JWT Bearer y retorna usuario autenticado."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticacion requerido",
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado",
        )

    username = str(payload.get("sub") or "").strip()
    role = _normalize_role(payload.get("role"))

    if not username or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o incompleto",
        )

    return AuthenticatedUser(username=username, role=role)


def require_roles(*roles: str):
    """Crea dependencia para restringir acceso por rol."""
    allowed_roles = {_normalize_role(role) for role in roles if _normalize_role(role)}

    def _dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta operacion",
            )
        return current_user

    return _dependency


@app.post("/api/auth/login", response_model=LoginResponse)
def auth_login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Autentica credenciales y retorna JWT firmado con rol."""
    ensure_default_auth_users(db)

    usuario = db.execute(
        select(UsuarioModel).where(UsuarioModel.username == payload.username),
    ).scalar_one_or_none()

    if usuario is None or not verify_password(payload.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales invalidas",
        )

    role = "admin" if str(usuario.rol).lower() == "admin" else "vendedor"
    token, expires_in = create_access_token(username=usuario.username, role=role)

    return LoginResponse(
        access_token=token,
        role=role,
        username=usuario.username,
        expires_in=expires_in,
    )


@app.get("/api/clientes", response_model=list[ClienteResponse])
def list_clientes(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> list[ClienteResponse]:
    """Lista todos los clientes de cartera."""
    clientes = db.execute(
        select(ClienteModel).order_by(ClienteModel.nombre.asc()),
    ).scalars().all()
    return [_to_cliente_model_response(cliente) for cliente in clientes]


def _build_cliente_page_response(
    query,
    page: int,
    limit: int,
    db: Session,
) -> ClienteCarteraPageResponse:
    """Construye una respuesta paginada de clientes para cartera."""
    total_items = db.execute(
        select(func.count()).select_from(query.subquery()),
    ).scalar_one()
    total_pages = max(1, (total_items + limit - 1) // limit)
    offset = (page - 1) * limit

    clientes = db.execute(
        query.order_by(ClienteModel.nombre.asc()).offset(offset).limit(limit),
    ).scalars().all()

    return ClienteCarteraPageResponse(
        data=[_to_cliente_model_response(cliente) for cliente in clientes],
        total_pages=total_pages,
        current_page=page,
    )


@app.get("/api/cartera/clientes", response_model=ClienteCarteraPageResponse)
def list_clientes_cartera_admin(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteCarteraPageResponse:
    """Lista todos los clientes para el libro contable de cartera."""
    query = select(ClienteModel)
    normalized_search = search.strip() if search else None

    if normalized_search:
        like_term = f"%{normalized_search}%"
        query = query.where(
            or_(
                ClienteModel.nombre.ilike(like_term),
                ClienteModel.documento.ilike(like_term),
                ClienteModel.telefono_whatsapp.ilike(like_term),
            ),
        )

    return _build_cliente_page_response(query=query, page=page, limit=limit, db=db)


@app.get("/api/clientes/cartera", response_model=ClienteCarteraPageResponse)
def list_clientes_cartera(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteCarteraPageResponse:
    """Lista clientes con deuda para la vista de cartera resumida."""
    query = select(ClienteModel).where(ClienteModel.deuda_total > 0)
    normalized_search = search.strip() if search else None

    if normalized_search:
        like_term = f"%{normalized_search}%"
        query = query.where(
            or_(
                ClienteModel.nombre.ilike(like_term),
                ClienteModel.documento.ilike(like_term),
                ClienteModel.telefono_whatsapp.ilike(like_term),
            ),
        )

    return _build_cliente_page_response(query=query, page=page, limit=limit, db=db)


@app.get(
    "/api/clientes/{cliente_id}/movimientos",
    response_model=MovimientoClientePageResponse,
)
@app.get(
    "/api/cartera/clientes/{cliente_id}/movimientos",
    response_model=MovimientoClientePageResponse,
)
def list_cliente_movimientos(
    cliente_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> MovimientoClientePageResponse:
    """Retorna historial de movimientos de un cliente paginado para el modal."""
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ventas = db.execute(
        select(VentaModel)
        .where(VentaModel.cliente_id == cliente_id)
        .order_by(VentaModel.fecha.desc()),
    ).scalars().all()

    abonos = db.execute(
        select(AbonoCarteraModel)
        .where(AbonoCarteraModel.cliente_id == cliente_id)
        .order_by(AbonoCarteraModel.fecha.desc()),
    ).scalars().all()

    detalles_por_venta_id: dict[int, list[DetalleVentaModel]] = {}
    venta_ids = [venta.id for venta in ventas]
    if venta_ids:
        detalles = db.execute(
            select(DetalleVentaModel).where(DetalleVentaModel.venta_id.in_(venta_ids)),
        ).scalars().all()
        for detalle in detalles:
            detalles_por_venta_id.setdefault(detalle.venta_id, []).append(detalle)

    movimientos: list[MovimientoClienteResponse] = []
    for venta in ventas:
        detalles_venta = detalles_por_venta_id.get(venta.id, [])
        cantidad_total = sum(detalle.cantidad for detalle in detalles_venta) or None
        articulo = None
        if detalles_venta:
            if len(detalles_venta) == 1:
                articulo = detalles_venta[0].nombre_producto
            else:
                articulo = f"{detalles_venta[0].nombre_producto} +{len(detalles_venta) - 1} más"

        movimientos.append(
            MovimientoClienteResponse(
                id=venta.id,
                tipo="Venta",
                descripcion="Venta fiada" if venta.es_fiado else "Venta cancelada",
                articulo=articulo,
                cantidad=cantidad_total,
                monto=venta.total,
                fecha=venta.fecha,
                saldo=venta.saldo_pendiente,
            ),
        )

    for abono in abonos:
        movimientos.append(
            MovimientoClienteResponse(
                id=abono.id,
                tipo="Abono",
                descripcion="Pago aplicado a deuda",
                referencia=abono.referencia,
                monto=abono.monto,
                fecha=abono.fecha,
                saldo=abono.saldo_cliente,
            ),
        )

    movimientos.sort(key=lambda movimiento: movimiento.fecha, reverse=True)

    total_items = len(movimientos)
    total_pages = max(1, (total_items + limit - 1) // limit)
    start = (page - 1) * limit
    end = start + limit
    movimientos_paginados = movimientos[start:end]

    return MovimientoClientePageResponse(
        data=movimientos_paginados,
        total_pages=total_pages,
        current_page=page,
    )


@app.post("/api/cartera/clientes/{cliente_id}/abonos", response_model=AbonoCarteraResponse, status_code=201)
def create_abono_cartera(
    cliente_id: int,
    payload: AbonoCarteraCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> AbonoCarteraResponse:
    """Registra un abono y descuenta deuda al cliente de cartera."""
    with db.begin():
        cliente = db.execute(
            select(ClienteModel)
            .where(ClienteModel.id == cliente_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if cliente is None:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        monto = float(payload.monto)
        if monto > float(cliente.deuda_total):
            raise HTTPException(
                status_code=400,
                detail="El abono supera la deuda actual del cliente",
            )

        cliente.deuda_total = float(cliente.deuda_total - monto)
        abono = AbonoCarteraModel(
            cliente_id=cliente.id,
            monto=monto,
            saldo_cliente=cliente.deuda_total,
            referencia=payload.referencia,
            fecha=_normalize_naive_datetime(payload.fecha) or datetime.utcnow(),
        )
        db.add(abono)
        db.flush()

    db.refresh(abono)
    return _to_abono_response(abono)


@app.post("/api/clientes", response_model=ClienteResponse, status_code=201)
@app.post("/api/cartera/clientes", response_model=ClienteResponse, status_code=201)
def create_cliente(
    payload: ClienteCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteResponse:
    """Registra un cliente nuevo y retorna su informacion base."""
    nombre_normalizado = payload.nombre.strip()
    if not nombre_normalizado:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")

    existente_por_nombre = db.execute(
        select(ClienteModel).where(ClienteModel.nombre == nombre_normalizado),
    ).scalar_one_or_none()
    if existente_por_nombre is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")

    documento = payload.documento.strip() if payload.documento else None
    telefono_whatsapp = payload.telefono_whatsapp.strip() if payload.telefono_whatsapp else None

    cliente = ClienteModel(
        nombre=nombre_normalizado,
        documento=documento,
        telefono_whatsapp=telefono_whatsapp,
        limite_credito=payload.limite_credito,
        deuda_total=0.0,
    )

    try:
        db.add(cliente)
        db.commit()
        db.refresh(cliente)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El documento ya existe para otro cliente",
        ) from exc

    return _to_cliente_model_response(cliente)


@app.patch("/api/cartera/clientes/{cliente_id}", response_model=ClienteResponse)
def update_cliente_cartera(
    cliente_id: int,
    payload: ClienteUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteResponse:
    """Edita datos base de cliente en cartera."""
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if (
        payload.nombre is None
        and payload.documento is None
        and payload.telefono_whatsapp is None
        and payload.limite_credito is None
    ):
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ClienteModel).where(
                ClienteModel.nombre == nombre,
                ClienteModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")
        cliente.nombre = nombre

    if payload.documento is not None:
        cliente.documento = payload.documento.strip() or None

    if payload.telefono_whatsapp is not None:
        cliente.telefono_whatsapp = payload.telefono_whatsapp.strip() or None

    if payload.limite_credito is not None:
        if payload.limite_credito < float(cliente.deuda_total):
            raise HTTPException(
                status_code=400,
                detail="El limite de credito no puede ser menor que la deuda actual",
            )
        cliente.limite_credito = payload.limite_credito

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflicto de datos al actualizar cliente") from exc

    db.refresh(cliente)
    return _to_cliente_model_response(cliente)


@app.delete(
    "/api/cartera/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_cartera(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina cliente sin historial contable asociado."""
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ventas_asociadas = db.execute(
        select(func.count())
        .select_from(VentaModel)
        .where(VentaModel.cliente_id == cliente_id),
    ).scalar_one()
    abonos_asociados = db.execute(
        select(func.count())
        .select_from(AbonoCarteraModel)
        .where(AbonoCarteraModel.cliente_id == cliente_id),
    ).scalar_one()

    if ventas_asociadas > 0 or abonos_asociados > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un cliente con historial de ventas o abonos",
        )

    db.delete(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/cartera/ventas", response_model=VentaResponse, status_code=201)
def create_cartera_venta(
    payload: CarteraVentaCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> VentaResponse:
    """Registra venta en libro contable de cartera con pago parcial o total."""
    total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []

    try:
        with db.begin():
            cliente = db.execute(
                select(ClienteModel)
                .where(ClienteModel.id == payload.cliente_id)
                .with_for_update(),
            ).scalar_one_or_none()

            if cliente is None:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")

            for item in payload.items:
                producto = db.execute(
                    select(ProductoModel)
                    .where(ProductoModel.id == item.producto_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if producto is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Producto {item.producto_id} no encontrado",
                    )

                if producto.stock_actual < item.cantidad:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Stock insuficiente para '{producto.nombre}'. "
                            f"Disponible: {producto.stock_actual}"
                        ),
                    )

                producto.stock_actual -= item.cantidad
                subtotal = float(item.cantidad * producto.precio_venta)
                total += subtotal

                detalle_payload.append(
                    VentaDetalleResponse(
                        producto_id=producto.id,
                        nombre_producto=producto.nombre,
                        cantidad=item.cantidad,
                        precio_unitario=producto.precio_venta,
                        subtotal=subtotal,
                    ),
                )

            abono_inicial = float(payload.abono_inicial)
            if abono_inicial > total:
                raise HTTPException(
                    status_code=400,
                    detail="El abono inicial no puede superar el total de la venta",
                )

            deuda_incremento = float(total - abono_inicial)
            nueva_deuda = float(cliente.deuda_total + deuda_incremento)
            if nueva_deuda > float(cliente.limite_credito):
                raise HTTPException(
                    status_code=400,
                    detail="Limite de credito excedido",
                )

            cliente.deuda_total = nueva_deuda

            fecha_venta = _normalize_naive_datetime(payload.fecha_venta) or datetime.utcnow()
            venta = VentaModel(
                cliente_id=cliente.id,
                cliente_tienda_id=None,
                tipo_fiado=FIADO_ORIGEN_CARTERA if deuda_incremento > 0 else None,
                es_fiado=deuda_incremento > 0,
                total=total,
                saldo_pendiente=cliente.deuda_total,
                fecha=fecha_venta,
            )
            db.add(venta)
            db.flush()

            for detalle in detalle_payload:
                db.add(
                    DetalleVentaModel(
                        venta_id=venta.id,
                        producto_id=detalle.producto_id,
                        nombre_producto=detalle.nombre_producto,
                        cantidad=detalle.cantidad,
                        precio_unitario=detalle.precio_unitario,
                        subtotal=detalle.subtotal,
                    ),
                )

            if abono_inicial > 0:
                db.add(
                    AbonoCarteraModel(
                        cliente_id=cliente.id,
                        monto=abono_inicial,
                        saldo_cliente=cliente.deuda_total,
                        referencia=payload.referencia or f"Abono aplicado en venta #{venta.id}",
                        fecha=fecha_venta,
                    ),
                )

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No fue posible registrar la venta de cartera por conflicto de datos",
        ) from exc

    resumen = _build_recibo_text(
        venta_id=venta.id,
        detalles=detalle_payload,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        cliente_nombre=cliente.nombre,
    )

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=None,
        cliente_nombre=cliente.nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalle_payload,
        resumen_recibo=resumen,
    )


@app.get(
    "/api/clientes/tienda-fiado",
    response_model=list[ClienteFiadoTiendaResponse],
)
def list_clientes_fiado_tienda(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ClienteFiadoTiendaResponse]:
    """Lista clientes de fiado operativo de tienda (separado de cartera)."""
    clientes = db.execute(
        select(ClienteFiadoTiendaModel).order_by(ClienteFiadoTiendaModel.nombre.asc()),
    ).scalars().all()

    return [
        ClienteFiadoTiendaResponse(
            id=cliente.id,
            nombre=cliente.nombre,
            telefono_whatsapp=cliente.telefono_whatsapp,
        )
        for cliente in clientes
    ]


@app.post(
    "/api/clientes/tienda-fiado",
    response_model=ClienteFiadoTiendaResponse,
    status_code=201,
)
def create_cliente_fiado_tienda(
    payload: ClienteFiadoTiendaCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ClienteFiadoTiendaResponse:
    """Crea un cliente fiado operativo de tienda."""
    existente = db.execute(
        select(ClienteFiadoTiendaModel).where(
            ClienteFiadoTiendaModel.nombre == payload.nombre,
        ),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")

    cliente = ClienteFiadoTiendaModel(
        nombre=payload.nombre,
        telefono_whatsapp=payload.telefono_whatsapp,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
    )


@app.patch(
    "/api/clientes/tienda-fiado/{cliente_id}",
    response_model=ClienteFiadoTiendaResponse,
)
def update_cliente_fiado_tienda(
    cliente_id: int,
    payload: ClienteFiadoTiendaUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFiadoTiendaResponse:
    """Edita cliente fiado operativo de tienda."""
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ClienteFiadoTiendaModel).where(
                ClienteFiadoTiendaModel.nombre == nombre,
                ClienteFiadoTiendaModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese nombre")
        cliente.nombre = nombre

    if payload.telefono_whatsapp is not None:
        cliente.telefono_whatsapp = payload.telefono_whatsapp.strip() or None

    db.commit()
    db.refresh(cliente)

    return ClienteFiadoTiendaResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
    )


@app.delete(
    "/api/clientes/tienda-fiado/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_fiado_tienda(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina cliente fiado tienda sin historial asociado."""
    cliente = db.execute(
        select(ClienteFiadoTiendaModel).where(ClienteFiadoTiendaModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente fiado tienda no encontrado")

    ventas_asociadas = db.execute(
        select(func.count())
        .select_from(VentaModel)
        .where(VentaModel.cliente_tienda_id == cliente_id),
    ).scalar_one()
    if ventas_asociadas > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un cliente con historial de ventas",
        )

    db.delete(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/proveedores", response_model=list[ProveedorResponse])
def list_proveedores(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ProveedorResponse]:
    """Lista proveedores activos e historicos."""
    proveedores = db.execute(
        select(ProveedorModel).order_by(ProveedorModel.nombre.asc()),
    ).scalars().all()
    return [_to_proveedor_response(item) for item in proveedores]


@app.post("/api/proveedores", response_model=ProveedorResponse, status_code=201)
def create_proveedor(
    payload: ProveedorCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ProveedorResponse:
    """Registra un nuevo proveedor."""
    existente = db.execute(
        select(ProveedorModel).where(ProveedorModel.nombre == payload.nombre),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un proveedor con ese nombre")

    proveedor = ProveedorModel(
        nombre=payload.nombre,
        contacto=payload.contacto,
        telefono=payload.telefono,
        activo=True,
    )
    db.add(proveedor)
    db.commit()
    db.refresh(proveedor)
    return _to_proveedor_response(proveedor)


@app.patch("/api/proveedores/{proveedor_id}", response_model=ProveedorResponse)
def update_proveedor(
    proveedor_id: int,
    payload: ProveedorUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ProveedorResponse:
    """Edita datos de proveedor."""
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ProveedorModel).where(
                ProveedorModel.nombre == nombre,
                ProveedorModel.id != proveedor_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un proveedor con ese nombre")
        proveedor.nombre = nombre

    if payload.contacto is not None:
        proveedor.contacto = payload.contacto.strip() or None

    if payload.telefono is not None:
        proveedor.telefono = payload.telefono.strip() or None

    if payload.activo is not None:
        proveedor.activo = payload.activo

    db.commit()
    db.refresh(proveedor)
    return _to_proveedor_response(proveedor)


@app.delete(
    "/api/proveedores/{proveedor_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_proveedor(
    proveedor_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina proveedor sin pedidos asociados."""
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    pedidos_asociados = db.execute(
        select(func.count())
        .select_from(PedidoProveedorModel)
        .where(PedidoProveedorModel.proveedor_id == proveedor_id),
    ).scalar_one()
    if pedidos_asociados > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un proveedor con pedidos registrados",
        )

    db.delete(proveedor)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/proveedores/pedidos", response_model=list[PedidoProveedorResponse])
def list_pedidos_proveedor(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[PedidoProveedorResponse]:
    """Lista pedidos a proveedores con su estado operativo."""
    pedidos = db.execute(
        select(PedidoProveedorModel).order_by(PedidoProveedorModel.fecha_creacion.desc()),
    ).scalars().all()

    proveedor_ids = {pedido.proveedor_id for pedido in pedidos}
    proveedores_map: dict[int, str] = {}
    if proveedor_ids:
        proveedores = db.execute(
            select(ProveedorModel).where(ProveedorModel.id.in_(proveedor_ids)),
        ).scalars().all()
        proveedores_map = {item.id: item.nombre for item in proveedores}

    return [
        _to_pedido_proveedor_response(
            pedido,
            proveedor_nombre=proveedores_map.get(pedido.proveedor_id, "Proveedor"),
        )
        for pedido in pedidos
    ]


@app.post(
    "/api/proveedores/pedidos",
    response_model=PedidoProveedorResponse,
    status_code=201,
)
def create_pedido_proveedor(
    payload: PedidoProveedorCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> PedidoProveedorResponse:
    """Crea un pedido directo sin aprobacion administrativa."""
    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == payload.proveedor_id),
    ).scalar_one_or_none()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    pedido = PedidoProveedorModel(
        proveedor_id=payload.proveedor_id,
        descripcion=payload.descripcion,
        monto_estimado=payload.monto_estimado,
        estado=PEDIDO_ESTADO_ENVIADO,
        creado_por=current_user.username,
        aprobado_por=None,
        fecha_resolucion=datetime.utcnow(),
    )
    db.add(pedido)
    db.commit()
    db.refresh(pedido)

    return _to_pedido_proveedor_response(pedido, proveedor_nombre=proveedor.nombre)


@app.patch(
    "/api/proveedores/pedidos/{pedido_id}",
    response_model=PedidoProveedorResponse,
)
def update_pedido_proveedor(
    pedido_id: int,
    payload: PedidoProveedorUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> PedidoProveedorResponse:
    """Edita pedido de proveedor existente."""
    pedido = db.execute(
        select(PedidoProveedorModel).where(PedidoProveedorModel.id == pedido_id),
    ).scalar_one_or_none()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    if payload.descripcion is not None:
        pedido.descripcion = payload.descripcion.strip()

    if payload.monto_estimado is not None:
        pedido.monto_estimado = payload.monto_estimado

    db.commit()
    db.refresh(pedido)

    proveedor = db.execute(
        select(ProveedorModel).where(ProveedorModel.id == pedido.proveedor_id),
    ).scalar_one_or_none()
    proveedor_nombre = proveedor.nombre if proveedor is not None else "Proveedor"
    return _to_pedido_proveedor_response(pedido, proveedor_nombre=proveedor_nombre)


@app.delete(
    "/api/proveedores/pedidos/{pedido_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_pedido_proveedor(
    pedido_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina un pedido a proveedor."""
    pedido = db.execute(
        select(PedidoProveedorModel).where(PedidoProveedorModel.id == pedido_id),
    ).scalar_one_or_none()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    db.delete(pedido)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/gastos", response_model=list[GastoResponse])
def list_gastos(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[GastoResponse]:
    """Lista gastos operativos registrados."""
    gastos = db.execute(
        select(GastoModel).order_by(GastoModel.fecha.desc()),
    ).scalars().all()
    return [
        GastoResponse(
            id=gasto.id,
            categoria=gasto.categoria,
            descripcion=gasto.descripcion,
            monto=gasto.monto,
            fecha=gasto.fecha,
            registrado_por=gasto.registrado_por,
        )
        for gasto in gastos
    ]


@app.post("/api/gastos", response_model=GastoResponse, status_code=201)
def create_gasto(
    payload: GastoCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> GastoResponse:
    """Registra un gasto de operacion."""
    gasto = GastoModel(
        categoria=payload.categoria,
        descripcion=payload.descripcion,
        monto=payload.monto,
        registrado_por=current_user.username,
    )
    db.add(gasto)
    db.commit()
    db.refresh(gasto)

    return GastoResponse(
        id=gasto.id,
        categoria=gasto.categoria,
        descripcion=gasto.descripcion,
        monto=gasto.monto,
        fecha=gasto.fecha,
        registrado_por=gasto.registrado_por,
    )


@app.patch("/api/gastos/{gasto_id}", response_model=GastoResponse)
def update_gasto(
    gasto_id: int,
    payload: GastoUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> GastoResponse:
    """Edita un gasto operativo."""
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    if payload.categoria is not None:
        gasto.categoria = payload.categoria.strip()

    if payload.descripcion is not None:
        gasto.descripcion = payload.descripcion.strip()

    if payload.monto is not None:
        gasto.monto = payload.monto

    db.commit()
    db.refresh(gasto)

    return GastoResponse(
        id=gasto.id,
        categoria=gasto.categoria,
        descripcion=gasto.descripcion,
        monto=gasto.monto,
        fecha=gasto.fecha,
        registrado_por=gasto.registrado_por,
    )


@app.delete(
    "/api/gastos/{gasto_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_gasto(
    gasto_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina un gasto operativo."""
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    db.delete(gasto)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/dashboard/resumen", response_model=DashboardResumenResponse)
def dashboard_resumen(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> DashboardResumenResponse:
    """Resume ventas de hoy, semana y mes para el modulo inicial."""
    now = datetime.utcnow()
    inicio_dia = now.replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_semana = inicio_dia - timedelta(days=inicio_dia.weekday())
    inicio_mes = inicio_dia.replace(day=1)

    ventas_diarias, transacciones_diarias = _ventas_metric_since(db, inicio_dia)
    ventas_semanales, transacciones_semanales = _ventas_metric_since(db, inicio_semana)
    ventas_mensuales, transacciones_mensuales = _ventas_metric_since(db, inicio_mes)

    return DashboardResumenResponse(
        ventas_diarias=ventas_diarias,
        ventas_semanales=ventas_semanales,
        ventas_mensuales=ventas_mensuales,
        transacciones_diarias=transacciones_diarias,
        transacciones_semanales=transacciones_semanales,
        transacciones_mensuales=transacciones_mensuales,
    )


@app.get(
    "/api/fidelizacion/clientes",
    response_model=list[ClienteFidelizacionResponse],
)
def list_clientes_fidelizacion(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ClienteFidelizacionResponse]:
    """Lista clientes del modulo de fidelizacion (independiente de cartera)."""
    clientes = db.execute(
        select(ClienteFidelizacionModel).order_by(
            ClienteFidelizacionModel.puntos_acumulados.desc(),
            ClienteFidelizacionModel.nombre.asc(),
        ),
    ).scalars().all()

    return [
        ClienteFidelizacionResponse(
            id=cliente.id,
            nombre=cliente.nombre,
            telefono_whatsapp=cliente.telefono_whatsapp,
            puntos_acumulados=cliente.puntos_acumulados,
        )
        for cliente in clientes
    ]


@app.post(
    "/api/fidelizacion/clientes",
    response_model=ClienteFidelizacionResponse,
    status_code=201,
)
def create_cliente_fidelizacion(
    payload: ClienteFidelizacionCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFidelizacionResponse:
    """Crea cliente del programa de fidelización."""
    existente = db.execute(
        select(ClienteFidelizacionModel).where(
            ClienteFidelizacionModel.telefono_whatsapp == payload.telefono_whatsapp,
        ),
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese WhatsApp")

    cliente = ClienteFidelizacionModel(
        nombre=payload.nombre,
        telefono_whatsapp=payload.telefono_whatsapp,
        puntos_acumulados=payload.puntos_acumulados,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@app.patch(
    "/api/fidelizacion/clientes/{cliente_id}",
    response_model=ClienteFidelizacionResponse,
)
def update_cliente_fidelizacion(
    cliente_id: int,
    payload: ClienteFidelizacionUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteFidelizacionResponse:
    """Edita cliente de fidelización."""
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if payload.nombre is not None:
        cliente.nombre = payload.nombre.strip()

    if payload.telefono_whatsapp is not None:
        telefono = payload.telefono_whatsapp.strip()
        existente = db.execute(
            select(ClienteFidelizacionModel).where(
                ClienteFidelizacionModel.telefono_whatsapp == telefono,
                ClienteFidelizacionModel.id != cliente_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese WhatsApp")
        cliente.telefono_whatsapp = telefono

    if payload.puntos_acumulados is not None:
        cliente.puntos_acumulados = payload.puntos_acumulados

    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@app.delete(
    "/api/fidelizacion/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina cliente de fidelización."""
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    db.delete(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/api/fidelizacion/clientes/{cliente_id}/canjear-bono",
    response_model=ClienteFidelizacionResponse,
)
def canjear_bono_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ClienteFidelizacionResponse:
    """Canjea un bono descontando puntos del cliente de fidelizacion."""
    cliente = db.execute(
        select(ClienteFidelizacionModel)
        .where(ClienteFidelizacionModel.id == cliente_id)
        .with_for_update(),
    ).scalar_one_or_none()

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if cliente.puntos_acumulados < FIDELIZACION_UMBRAL_BONO:
        raise HTTPException(
            status_code=400,
            detail="El cliente aun no alcanza el umbral para canjear bono",
        )

    cliente.puntos_acumulados -= FIDELIZACION_UMBRAL_BONO
    db.commit()
    db.refresh(cliente)

    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


@app.get("/api/productos", response_model=list[ProductoResponse])
def list_productos(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[ProductoResponse]:
    """Lista todos los productos del inventario."""
    repository = SqlAlchemyProductoRepository(db)
    productos = repository.list_all()
    return [_to_producto_response(producto) for producto in productos]


@app.post("/api/productos", response_model=ProductoResponse, status_code=201)
def create_producto(
    payload: ProductoCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ProductoResponse:
    """Crea un producto nuevo para inventario."""
    repository = SqlAlchemyProductoRepository(db)

    if repository.get_by_nombre(payload.nombre) is not None:
        raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre")

    producto = Producto(
        nombre=payload.nombre,
        precio_costo=payload.precio_costo,
        precio_venta=payload.precio_venta,
        stock=payload.stock_actual,
        stock_minimo=payload.stock_minimo,
    )

    try:
        created = repository.add(producto)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo crear el producto por restriccion de unicidad",
        ) from exc

    return _to_producto_response(created)


@app.patch("/api/productos/{producto_id}", response_model=ProductoResponse)
def update_producto(
    producto_id: int,
    payload: ProductoUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ProductoResponse:
    """Edita datos de producto en inventario."""
    producto = db.execute(
        select(ProductoModel).where(ProductoModel.id == producto_id),
    ).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacio")

        existente = db.execute(
            select(ProductoModel).where(
                ProductoModel.nombre == nombre,
                ProductoModel.id != producto_id,
            ),
        ).scalar_one_or_none()
        if existente is not None:
            raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre")
        producto.nombre = nombre

    if payload.precio_costo is not None:
        producto.precio_costo = payload.precio_costo

    if payload.precio_venta is not None:
        producto.precio_venta = payload.precio_venta

    if payload.stock_actual is not None:
        producto.stock_actual = payload.stock_actual

    if payload.stock_minimo is not None:
        producto.stock_minimo = payload.stock_minimo

    db.commit()
    db.refresh(producto)

    return ProductoResponse(
        id=producto.id,
        nombre=producto.nombre,
        precio_costo=producto.precio_costo,
        precio_venta=producto.precio_venta,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
        stock_critico=producto.stock_actual <= producto.stock_minimo,
    )


@app.delete(
    "/api/productos/{producto_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina un producto sin historial de ventas asociado."""
    producto = db.execute(
        select(ProductoModel).where(ProductoModel.id == producto_id),
    ).scalar_one_or_none()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    detalles_asociados = db.execute(
        select(func.count())
        .select_from(DetalleVentaModel)
        .where(DetalleVentaModel.producto_id == producto_id),
    ).scalar_one()
    if detalles_asociados > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un producto con historial de ventas",
        )

    db.delete(producto)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.patch("/api/productos/{producto_id}/stock", response_model=ProductoResponse)
def patch_producto_stock(
    producto_id: int,
    payload: ProductoStockPatchRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ProductoResponse:
    """Ajusta stock de forma rapida sumando o restando unidades."""
    repository = SqlAlchemyProductoRepository(db)

    try:
        updated = repository.update_stock(producto_id, payload.delta)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    return _to_producto_response(updated)


@app.patch("/api/productos/{producto_id}/precio_venta", response_model=ProductoResponse)
def patch_producto_precio_venta(
    producto_id: int,
    payload: ProductoPrecioPatchRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> ProductoResponse:
    """Permite editar precio de venta en modo inline desde el dashboard."""
    repository = SqlAlchemyProductoRepository(db)

    try:
        updated = repository.update_precio_venta(producto_id, payload.precio_venta)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    return _to_producto_response(updated)


@app.post("/api/ventas", response_model=VentaResponse, status_code=201)
def create_venta(
    payload: VentaCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> VentaResponse:
    """Registra una venta de forma atomica con control de stock y credito."""
    total = 0.0
    detalle_payload: list[VentaDetalleResponse] = []
    cliente: ClienteModel | None = None
    cliente_tienda: ClienteFiadoTiendaModel | None = None
    cliente_nombre: str | None = None
    saldo_pendiente = 0.0
    fiado_origen: str | None = None

    if payload.es_fiado:
        fiado_origen = str(payload.fiado_origen or "").lower().strip()
        if fiado_origen not in {FIADO_ORIGEN_CARTERA, FIADO_ORIGEN_TIENDA}:
            raise HTTPException(
                status_code=400,
                detail="Debes indicar fiado_origen: cartera o tienda",
            )
    else:
        fiado_origen = None

    try:
        with db.begin():
            if payload.es_fiado and fiado_origen == FIADO_ORIGEN_CARTERA:
                if current_user.role != "admin":
                    raise HTTPException(
                        status_code=403,
                        detail="Solo admin puede registrar fiados de cartera",
                    )

                if payload.cliente_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Debes seleccionar un cliente de cartera para fiado",
                    )

                cliente = db.execute(
                    select(ClienteModel)
                    .where(ClienteModel.id == payload.cliente_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if cliente is None:
                    raise HTTPException(status_code=404, detail="Cliente no encontrado")

                cliente_nombre = cliente.nombre

            if payload.es_fiado and fiado_origen == FIADO_ORIGEN_TIENDA:
                if payload.cliente_tienda_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Debes seleccionar un cliente fiado de tienda",
                    )

                cliente_tienda = db.execute(
                    select(ClienteFiadoTiendaModel)
                    .where(ClienteFiadoTiendaModel.id == payload.cliente_tienda_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if cliente_tienda is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Cliente fiado de tienda no encontrado",
                    )

                cliente_nombre = cliente_tienda.nombre

            for item in payload.items:
                producto = db.execute(
                    select(ProductoModel)
                    .where(ProductoModel.id == item.producto_id)
                    .with_for_update(),
                ).scalar_one_or_none()

                if producto is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Producto {item.producto_id} no encontrado",
                    )

                if producto.stock_actual < item.cantidad:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Stock insuficiente para '{producto.nombre}'. "
                            f"Disponible: {producto.stock_actual}"
                        ),
                    )

                producto.stock_actual -= item.cantidad
                subtotal = float(item.cantidad * producto.precio_venta)
                total += subtotal

                detalle_payload.append(
                    VentaDetalleResponse(
                        producto_id=producto.id,
                        nombre_producto=producto.nombre,
                        cantidad=item.cantidad,
                        precio_unitario=producto.precio_venta,
                        subtotal=subtotal,
                    ),
                )

            if payload.es_fiado:
                if fiado_origen == FIADO_ORIGEN_CARTERA:
                    if cliente is None:
                        raise HTTPException(
                            status_code=400,
                            detail="Debes seleccionar un cliente de cartera",
                        )

                    nueva_deuda = float(cliente.deuda_total + total)
                    if nueva_deuda > float(cliente.limite_credito):
                        raise HTTPException(
                            status_code=400,
                            detail="Limite de credito excedido",
                        )
                    cliente.deuda_total = nueva_deuda
                    saldo_pendiente = nueva_deuda
                elif fiado_origen == FIADO_ORIGEN_TIENDA:
                    saldo_pendiente = float(total)

            venta = VentaModel(
                cliente_id=cliente.id if cliente is not None else None,
                cliente_tienda_id=cliente_tienda.id if cliente_tienda is not None else None,
                tipo_fiado=fiado_origen,
                es_fiado=payload.es_fiado,
                total=total,
                saldo_pendiente=saldo_pendiente,
            )
            db.add(venta)
            db.flush()

            for detalle in detalle_payload:
                db.add(
                    DetalleVentaModel(
                        venta_id=venta.id,
                        producto_id=detalle.producto_id,
                        nombre_producto=detalle.nombre_producto,
                        cantidad=detalle.cantidad,
                        precio_unitario=detalle.precio_unitario,
                        subtotal=detalle.subtotal,
                    ),
                )

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No fue posible registrar la venta por conflicto de datos",
        ) from exc

    resumen = _build_recibo_text(
        venta_id=venta.id,
        detalles=detalle_payload,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        cliente_nombre=cliente_nombre,
    )

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=venta.cliente_tienda_id,
        cliente_nombre=cliente_nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalle_payload,
        resumen_recibo=resumen,
    )


@app.get("/api/ventas", response_model=list[VentaResponse])
def list_ventas(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "vendedor")),
) -> list[VentaResponse]:
    """Lista ventas registradas para analitica de dashboard y POS."""
    ventas = db.execute(
        select(VentaModel).order_by(VentaModel.fecha.desc()),
    ).scalars().all()

    cliente_ids = {venta.cliente_id for venta in ventas if venta.cliente_id is not None}
    clientes_por_id: dict[int, str] = {}
    if cliente_ids:
        clientes = db.execute(
            select(ClienteModel).where(ClienteModel.id.in_(cliente_ids)),
        ).scalars().all()
        clientes_por_id = {cliente.id: cliente.nombre for cliente in clientes}

    clientes_tienda_ids = {
        venta.cliente_tienda_id
        for venta in ventas
        if venta.cliente_tienda_id is not None
    }
    clientes_tienda_por_id: dict[int, str] = {}
    if clientes_tienda_ids:
        clientes_tienda = db.execute(
            select(ClienteFiadoTiendaModel).where(
                ClienteFiadoTiendaModel.id.in_(clientes_tienda_ids),
            ),
        ).scalars().all()
        clientes_tienda_por_id = {
            cliente.id: cliente.nombre
            for cliente in clientes_tienda
        }

    payload: list[VentaResponse] = []
    for venta in ventas:
        detalles_model = db.execute(
            select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta.id),
        ).scalars().all()
        detalles = [_to_detalle_response(detalle) for detalle in detalles_model]
        if venta.cliente_id is not None:
            cliente_nombre = clientes_por_id.get(venta.cliente_id)
        elif venta.cliente_tienda_id is not None:
            cliente_nombre = clientes_tienda_por_id.get(venta.cliente_tienda_id)
        else:
            cliente_nombre = None

        payload.append(
            VentaResponse(
                venta_id=venta.id,
                cliente_id=venta.cliente_id,
                cliente_tienda_id=venta.cliente_tienda_id,
                cliente_nombre=cliente_nombre,
                es_fiado=venta.es_fiado,
                fiado_origen=venta.tipo_fiado,
                total=venta.total,
                saldo_pendiente=venta.saldo_pendiente,
                fecha=venta.fecha,
                detalles=detalles,
                resumen_recibo=_build_recibo_text(
                    venta_id=venta.id,
                    detalles=detalles,
                    total=venta.total,
                    saldo_pendiente=venta.saldo_pendiente,
                    cliente_nombre=cliente_nombre,
                ),
            ),
        )

    return payload


@app.patch("/api/ventas/{venta_id}", response_model=VentaResponse)
def update_venta(
    venta_id: int,
    payload: VentaUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> VentaResponse:
    """Edita venta operativa (no cartera) desde modulo administrativo."""
    campos = payload.model_fields_set
    if not campos:
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    with db.begin():
        venta = db.execute(
            select(VentaModel)
            .where(VentaModel.id == venta_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if venta is None:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if venta.tipo_fiado == FIADO_ORIGEN_CARTERA:
            raise HTTPException(
                status_code=409,
                detail="Las ventas de cartera se gestionan desde el modulo de cartera",
            )

        total = float(payload.total) if "total" in campos and payload.total is not None else float(venta.total)

        es_fiado = (
            payload.es_fiado
            if "es_fiado" in campos and payload.es_fiado is not None
            else bool(venta.es_fiado)
        )

        tipo_fiado = venta.tipo_fiado
        if "fiado_origen" in campos:
            tipo_fiado = str(payload.fiado_origen or "").lower().strip() or None

        cliente_id = venta.cliente_id
        if "cliente_id" in campos:
            cliente_id = payload.cliente_id

        cliente_tienda_id = venta.cliente_tienda_id
        if "cliente_tienda_id" in campos:
            cliente_tienda_id = payload.cliente_tienda_id

        if es_fiado:
            if tipo_fiado not in {FIADO_ORIGEN_TIENDA}:
                raise HTTPException(
                    status_code=400,
                    detail="Solo se permite editar ventas fiadas de tienda desde este modulo",
                )
            if cliente_tienda_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="Debes definir cliente_tienda_id para venta fiada de tienda",
                )

            cliente_tienda = db.execute(
                select(ClienteFiadoTiendaModel)
                .where(ClienteFiadoTiendaModel.id == cliente_tienda_id)
                .with_for_update(),
            ).scalar_one_or_none()
            if cliente_tienda is None:
                raise HTTPException(status_code=404, detail="Cliente fiado de tienda no encontrado")

            cliente_id = None
            saldo_pendiente = (
                float(payload.saldo_pendiente)
                if "saldo_pendiente" in campos and payload.saldo_pendiente is not None
                else float(total)
            )
        else:
            tipo_fiado = None
            cliente_id = None
            cliente_tienda_id = None
            saldo_pendiente = (
                float(payload.saldo_pendiente)
                if "saldo_pendiente" in campos and payload.saldo_pendiente is not None
                else 0.0
            )

        venta.total = total
        venta.es_fiado = es_fiado
        venta.tipo_fiado = tipo_fiado
        venta.cliente_id = cliente_id
        venta.cliente_tienda_id = cliente_tienda_id
        venta.saldo_pendiente = saldo_pendiente
        db.flush()

    venta = db.execute(
        select(VentaModel).where(VentaModel.id == venta_id),
    ).scalar_one_or_none()
    if venta is None:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    detalles_model = db.execute(
        select(DetalleVentaModel).where(DetalleVentaModel.venta_id == venta.id),
    ).scalars().all()
    detalles = [_to_detalle_response(detalle) for detalle in detalles_model]

    if venta.cliente_id is not None:
        cliente_model = db.execute(
            select(ClienteModel).where(ClienteModel.id == venta.cliente_id),
        ).scalar_one_or_none()
        cliente_nombre = cliente_model.nombre if cliente_model is not None else None
    elif venta.cliente_tienda_id is not None:
        cliente_tienda_model = db.execute(
            select(ClienteFiadoTiendaModel).where(
                ClienteFiadoTiendaModel.id == venta.cliente_tienda_id,
            ),
        ).scalar_one_or_none()
        cliente_nombre = cliente_tienda_model.nombre if cliente_tienda_model is not None else None
    else:
        cliente_nombre = None

    return VentaResponse(
        venta_id=venta.id,
        cliente_id=venta.cliente_id,
        cliente_tienda_id=venta.cliente_tienda_id,
        cliente_nombre=cliente_nombre,
        es_fiado=venta.es_fiado,
        fiado_origen=venta.tipo_fiado,
        total=venta.total,
        saldo_pendiente=venta.saldo_pendiente,
        fecha=venta.fecha,
        detalles=detalles,
        resumen_recibo=_build_recibo_text(
            venta_id=venta.id,
            detalles=detalles,
            total=venta.total,
            saldo_pendiente=venta.saldo_pendiente,
            cliente_nombre=cliente_nombre,
        ),
    )


@app.delete(
    "/api/ventas/{venta_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina venta operativa y repone stock de sus detalles."""
    with db.begin():
        venta = db.execute(
            select(VentaModel)
            .where(VentaModel.id == venta_id)
            .with_for_update(),
        ).scalar_one_or_none()

        if venta is None:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if venta.tipo_fiado == FIADO_ORIGEN_CARTERA:
            raise HTTPException(
                status_code=409,
                detail="Las ventas de cartera se eliminan desde el modulo de cartera",
            )

        detalles = db.execute(
            select(DetalleVentaModel)
            .where(DetalleVentaModel.venta_id == venta.id)
            .with_for_update(),
        ).scalars().all()

        for detalle in detalles:
            producto = db.execute(
                select(ProductoModel)
                .where(ProductoModel.id == detalle.producto_id)
                .with_for_update(),
            ).scalar_one_or_none()
            if producto is not None:
                producto.stock_actual = int(producto.stock_actual + detalle.cantidad)

        for detalle in detalles:
            db.delete(detalle)

        db.delete(venta)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/auditorias", response_model=list[AuditoriaResponse])
def list_auditorias(
    modulo: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> list[AuditoriaResponse]:
    """Lista bitacora de auditorias con filtro opcional por modulo."""
    query = select(AuditoriaModel)
    if modulo:
        query = query.where(AuditoriaModel.modulo == modulo.strip())

    auditorias = db.execute(
        query.order_by(AuditoriaModel.fecha.desc(), AuditoriaModel.id.desc()),
    ).scalars().all()
    return [_to_auditoria_response(auditoria) for auditoria in auditorias]


@app.post("/api/auditorias", response_model=AuditoriaResponse, status_code=201)
def create_auditoria(
    payload: AuditoriaCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin")),
) -> AuditoriaResponse:
    """Crea registro manual de auditoria para control administrativo."""
    auditoria = AuditoriaModel(
        modulo=payload.modulo.strip(),
        entidad=payload.entidad.strip(),
        entidad_id=payload.entidad_id,
        accion=payload.accion.strip(),
        detalle=payload.detalle.strip() if payload.detalle else None,
        usuario=current_user.username,
    )
    db.add(auditoria)
    db.commit()
    db.refresh(auditoria)
    return _to_auditoria_response(auditoria)


@app.patch("/api/auditorias/{auditoria_id}", response_model=AuditoriaResponse)
def update_auditoria(
    auditoria_id: int,
    payload: AuditoriaUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("admin")),
) -> AuditoriaResponse:
    """Edita registro existente de auditoria."""
    auditoria = db.execute(
        select(AuditoriaModel).where(AuditoriaModel.id == auditoria_id),
    ).scalar_one_or_none()
    if auditoria is None:
        raise HTTPException(status_code=404, detail="Auditoria no encontrada")

    campos = payload.model_fields_set
    if not campos:
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    if payload.modulo is not None:
        auditoria.modulo = payload.modulo.strip()
    if payload.entidad is not None:
        auditoria.entidad = payload.entidad.strip()
    if payload.entidad_id is not None:
        auditoria.entidad_id = payload.entidad_id
    if payload.accion is not None:
        auditoria.accion = payload.accion.strip()
    if payload.detalle is not None:
        auditoria.detalle = payload.detalle.strip() or None

    auditoria.usuario = current_user.username
    db.commit()
    db.refresh(auditoria)
    return _to_auditoria_response(auditoria)


@app.delete(
    "/api/auditorias/{auditoria_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_auditoria(
    auditoria_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> Response:
    """Elimina registro de auditoria."""
    auditoria = db.execute(
        select(AuditoriaModel).where(AuditoriaModel.id == auditoria_id),
    ).scalar_one_or_none()
    if auditoria is None:
        raise HTTPException(status_code=404, detail="Auditoria no encontrada")

    db.delete(auditoria)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/clientes/{nombre}", response_model=ClienteResponse)
def get_cliente_por_nombre(
    nombre: str,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin")),
) -> ClienteResponse:
    """Obtiene un cliente por nombre desde la capa de repositorio."""
    repository = SqlAlchemyClienteRepository(db)
    cliente = repository.get_by_nombre(nombre)

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return _to_cliente_response(cliente)
