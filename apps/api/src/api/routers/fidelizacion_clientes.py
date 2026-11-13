"""Router del modulo de fidelizacion de clientes.

Los puntos cambian solo por compras/canjes/anulaciones (ver ``services.fidelizacion``) o por un ajuste manual
de un administrador con motivo; todo queda en el historial del cliente y los ajustes tambien en la auditoria.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.pagination import PageInfo, build_page, search_filter
from src.api.services.auditoria import registrar_auditoria
from src.api.services.fidelizacion import cliente_bloqueado, mover_puntos, pesos_por_punto, umbral_bono, valor_punto
from src.api.services.telefono import TelefonoInvalido, normalizar_telefono
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import ClienteFidelizacionModel, MovimientoPuntosModel

router = APIRouter(tags=["fidelizacion-clientes"])

PUNTOS_MAXIMOS = 1_000_000
ROLES_ADMIN = {"superadmin"}


class FidelizacionConfigResponse(BaseModel):
    """Reglas del programa (fuente unica para el frontend)."""

    umbral_bono: int
    pesos_por_punto: int
    valor_punto: int


@router.get("/api/fidelizacion/config", response_model=FidelizacionConfigResponse)
def get_fidelizacion_config(
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> FidelizacionConfigResponse:
    return FidelizacionConfigResponse(
        umbral_bono=umbral_bono(),
        pesos_por_punto=pesos_por_punto(),
        valor_punto=valor_punto(),
    )


class ClienteFidelizacionResponse(BaseModel):
    """DTO de salida para clientes del modulo de fidelizacion."""

    id: int
    nombre: str
    telefono_whatsapp: str
    puntos_acumulados: int


class ClienteFidelizacionItem(ClienteFidelizacionResponse):
    """Fila de la lista de la pantalla: ademas de los puntos, si el cliente esta activo."""

    activo: bool = True


class ClientesFidelizacionPageResponse(BaseModel):
    data: list[ClienteFidelizacionItem]
    page: PageInfo


class ResumenFidelizacionResponse(BaseModel):
    """Cifras de TODO el programa (no solo de la pagina que se ve)."""

    total_activos: int
    pueden_canjear: int
    desactivados: int
    puntos_en_circulacion: int
    valor_en_circulacion: int
    umbral_bono: int
    valor_punto: int


class ClienteFidelizacionCreateRequest(BaseModel):
    """Entrada para crear cliente de fidelizacion."""

    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    telefono_whatsapp: Annotated[str, Field(min_length=7, max_length=25)]
    puntos_acumulados: Annotated[int, Field(ge=0, le=PUNTOS_MAXIMOS)] = 0
    # El cliente debe autorizar el uso de sus datos para inscribirlo.
    acepta_datos: bool = False


class ClienteFidelizacionUpdateRequest(BaseModel):
    """Entrada para editar cliente de fidelizacion."""

    nombre: Annotated[str | None, Field(min_length=3, max_length=120)] = None
    telefono_whatsapp: Annotated[str | None, Field(min_length=7, max_length=25)] = None
    puntos_acumulados: Annotated[int | None, Field(ge=0, le=PUNTOS_MAXIMOS)] = None


class AjustePuntosRequest(BaseModel):
    """Correccion manual de puntos: siempre con motivo."""

    modo: Literal["sumar", "restar", "fijar"]
    puntos: Annotated[int, Field(ge=0, le=PUNTOS_MAXIMOS)]
    motivo: Annotated[str, Field(min_length=3, max_length=200)]


class MovimientoPuntosResponse(BaseModel):
    id: int
    fecha: datetime
    tipo: str
    puntos: int
    saldo: int
    motivo: str | None = None
    usuario: str
    referencia_tipo: str | None = None
    referencia_id: int | None = None


class MovimientosPuntosPageResponse(BaseModel):
    data: list[MovimientoPuntosResponse]
    page: PageInfo


def _respuesta(cliente: ClienteFidelizacionModel) -> ClienteFidelizacionResponse:
    return ClienteFidelizacionResponse(
        id=cliente.id,
        nombre=cliente.nombre,
        telefono_whatsapp=cliente.telefono_whatsapp,
        puntos_acumulados=cliente.puntos_acumulados,
    )


def _telefono_o_400(valor: str) -> str:
    """Telefono en el formato unico (57 + digitos); 400 si no se puede interpretar."""
    try:
        telefono = normalizar_telefono(valor)
    except TelefonoInvalido as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if telefono is None:
        raise HTTPException(status_code=400, detail="El WhatsApp es obligatorio")
    return telefono


def _exigir_telefono_libre(db: Session, telefono: str, excluir_id: int | None = None) -> None:
    """El mismo numero no puede estar dos veces, aunque se haya escrito distinto o ya estuviera guardado sin el 57."""
    query = select(ClienteFidelizacionModel)
    if excluir_id is not None:
        query = query.where(ClienteFidelizacionModel.id != excluir_id)
    for otro in db.execute(query).scalars():
        try:
            igual = normalizar_telefono(otro.telefono_whatsapp) == telefono
        except TelefonoInvalido:
            igual = otro.telefono_whatsapp == telefono  # un numero viejo con formato raro solo choca si es identico
        if igual:
            raise HTTPException(status_code=409, detail=f"Ya existe un cliente con ese WhatsApp: {otro.nombre}")


@router.get("/api/fidelizacion/clientes/paginados", response_model=ClientesFidelizacionPageResponse)
def list_clientes_fidelizacion_paginados(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    q: str | None = Query(default=None, max_length=100, description="Nombre o parte del WhatsApp"),
    estado: Literal["activos", "canjeables", "desactivados", "todos"] = Query(default="activos"),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> ClientesFidelizacionPageResponse:
    """Busqueda, filtro y pagina resueltos en el servidor. Ver los desactivados es de administradores."""
    if estado in ("desactivados", "todos") and current_user.role not in ROLES_ADMIN:
        raise HTTPException(status_code=403, detail="Solo un administrador puede ver los clientes desactivados")

    query = select(ClienteFidelizacionModel)
    if estado == "desactivados":
        query = query.where(ClienteFidelizacionModel.activo.is_(False))
    elif estado != "todos":
        query = query.where(ClienteFidelizacionModel.activo.is_(True))
    if estado == "canjeables":
        query = query.where(ClienteFidelizacionModel.puntos_acumulados >= umbral_bono())

    termino = (q or "").strip()
    if termino:
        condiciones = list(search_filter(" ".join(termino.split()), ClienteFidelizacionModel.nombre))
        digitos = "".join(c for c in termino if c.isdigit())
        if len(digitos) >= 3:  # "300 111" encuentra 573001112233 y tambien 3001112233
            condiciones.append(ClienteFidelizacionModel.telefono_whatsapp.contains(digitos))
        query = query.where(or_(*condiciones))

    orden = (ClienteFidelizacionModel.puntos_acumulados.desc(), ClienteFidelizacionModel.nombre.asc())
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    offset = (page - 1) * limit
    clientes = db.execute(query.order_by(*orden).offset(offset).limit(limit)).scalars().all()
    return ClientesFidelizacionPageResponse(
        data=[ClienteFidelizacionItem(**_respuesta(c).model_dump(), activo=bool(c.activo)) for c in clientes],
        page=PageInfo(total=total, total_pages=max(1, (total + limit - 1) // limit), current_page=page, limit=limit),
    )


@router.get("/api/fidelizacion/resumen", response_model=ResumenFidelizacionResponse)
def get_resumen_fidelizacion(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> ResumenFidelizacionResponse:
    activos = ClienteFidelizacionModel.activo.is_(True)
    total_activos = db.execute(select(func.count()).select_from(ClienteFidelizacionModel).where(activos)).scalar_one()
    pueden_canjear = db.execute(
        select(func.count()).select_from(ClienteFidelizacionModel).where(activos, ClienteFidelizacionModel.puntos_acumulados >= umbral_bono()),
    ).scalar_one()
    desactivados = db.execute(
        select(func.count()).select_from(ClienteFidelizacionModel).where(ClienteFidelizacionModel.activo.is_(False)),
    ).scalar_one()
    puntos = int(db.execute(select(func.coalesce(func.sum(ClienteFidelizacionModel.puntos_acumulados), 0)).where(activos)).scalar_one() or 0)
    return ResumenFidelizacionResponse(
        total_activos=total_activos,
        pueden_canjear=pueden_canjear,
        desactivados=desactivados,
        puntos_en_circulacion=puntos,
        valor_en_circulacion=puntos * valor_punto(),
        umbral_bono=umbral_bono(),
        valor_punto=valor_punto(),
    )


@router.get("/api/fidelizacion/clientes", response_model=list[ClienteFidelizacionResponse])
def list_clientes_fidelizacion(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    include_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> list[ClienteFidelizacionResponse]:
    query = select(ClienteFidelizacionModel)
    if not include_inactivos:
        query = query.where(ClienteFidelizacionModel.activo == True)
    offset = (page - 1) * limit
    clientes = db.execute(
        query.order_by(
            ClienteFidelizacionModel.puntos_acumulados.desc(),
            ClienteFidelizacionModel.nombre.asc(),
        ).offset(offset).limit(limit),
    ).scalars().all()

    return [_respuesta(cliente) for cliente in clientes]


@router.post("/api/fidelizacion/clientes", response_model=ClienteFidelizacionResponse, status_code=201)
def create_cliente_fidelizacion(
    payload: ClienteFidelizacionCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> ClienteFidelizacionResponse:
    if not payload.acepta_datos:
        raise HTTPException(status_code=400, detail="El cliente debe autorizar el tratamiento de sus datos")
    nombre = " ".join(payload.nombre.split())
    if len(nombre) < 3:
        raise HTTPException(status_code=400, detail="El nombre debe tener al menos 3 caracteres")
    # Solo quien administra puede fijar puntos iniciales; el vendedor inscribe en cero.
    puntos_iniciales = payload.puntos_acumulados if current_user.role in ROLES_ADMIN else 0
    telefono = _telefono_o_400(payload.telefono_whatsapp)
    _exigir_telefono_libre(db, telefono)

    cliente = ClienteFidelizacionModel(
        nombre=nombre,
        telefono_whatsapp=telefono,
        puntos_acumulados=0,
        acepta_datos=True,
        acepta_datos_en=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(cliente)
    db.flush()
    if puntos_iniciales:
        mover_puntos(db, cliente, puntos_iniciales, tipo="inicial", usuario=current_user.username, motivo="Puntos iniciales al inscribirlo")
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="fidelizacion",
        entidad="cliente_fidelizacion",
        accion="crear",
        entidad_id=cliente.id,
        detalle=f"Inscrito: {cliente.nombre}" + (f" con {puntos_iniciales} puntos" if puntos_iniciales else ""),
    )
    db.commit()
    db.refresh(cliente)
    return _respuesta(cliente)


@router.patch("/api/fidelizacion/clientes/{cliente_id}", response_model=ClienteFidelizacionResponse)
def update_cliente_fidelizacion(
    cliente_id: int,
    payload: ClienteFidelizacionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> ClienteFidelizacionResponse:
    cliente = cliente_bloqueado(db, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    cambios: list[str] = []
    if payload.nombre is not None:
        nombre = " ".join(payload.nombre.split())
        if len(nombre) < 3:
            raise HTTPException(status_code=400, detail="El nombre debe tener al menos 3 caracteres")
        if nombre != cliente.nombre:
            cambios.append(f"nombre: {cliente.nombre} -> {nombre}")
            cliente.nombre = nombre

    if payload.telefono_whatsapp is not None:
        telefono = _telefono_o_400(payload.telefono_whatsapp)
        _exigir_telefono_libre(db, telefono, excluir_id=cliente_id)
        if telefono != cliente.telefono_whatsapp:
            cambios.append(f"whatsapp: {cliente.telefono_whatsapp} -> {telefono}")
            cliente.telefono_whatsapp = telefono

    if payload.puntos_acumulados is not None and payload.puntos_acumulados != int(cliente.puntos_acumulados):
        antes = int(cliente.puntos_acumulados)
        mover_puntos(
            db, cliente, payload.puntos_acumulados - antes,
            tipo="ajuste", usuario=current_user.username, motivo="Ajuste manual desde el panel de gerencia",
        )
        cambios.append(f"puntos: {antes} -> {cliente.puntos_acumulados}")

    if cambios:
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="fidelizacion",
            entidad="cliente_fidelizacion",
            accion="actualizar",
            entidad_id=cliente.id,
            detalle="; ".join(cambios),
        )
    db.commit()
    db.refresh(cliente)
    return _respuesta(cliente)


@router.post("/api/fidelizacion/clientes/{cliente_id}/ajustes", response_model=ClienteFidelizacionResponse)
def ajustar_puntos_cliente(
    cliente_id: int,
    payload: AjustePuntosRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> ClienteFidelizacionResponse:
    """Corrige los puntos de un cliente: sumar, restar o dejarlos en una cantidad exacta, siempre con motivo."""
    cliente = cliente_bloqueado(db, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    antes = int(cliente.puntos_acumulados)
    if payload.modo in ("sumar", "restar") and payload.puntos == 0:
        raise HTTPException(status_code=400, detail="Indica cuantos puntos sumar o restar")
    if payload.modo == "restar" and payload.puntos > antes:
        raise HTTPException(status_code=400, detail=f"El cliente solo tiene {antes} puntos")
    delta = {"sumar": payload.puntos, "restar": -payload.puntos, "fijar": payload.puntos - antes}[payload.modo]
    if delta == 0:
        raise HTTPException(status_code=400, detail="El cliente ya tiene esa cantidad de puntos")

    motivo = " ".join(payload.motivo.split())
    if len(motivo) < 3:
        raise HTTPException(status_code=400, detail="El motivo debe tener al menos 3 caracteres")
    mover_puntos(db, cliente, delta, tipo="ajuste", usuario=current_user.username, motivo=motivo)
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="fidelizacion",
        entidad="cliente_fidelizacion",
        accion="ajustar_puntos",
        entidad_id=cliente.id,
        detalle=f"{cliente.nombre}: {antes} -> {cliente.puntos_acumulados} puntos. Motivo: {motivo}",
    )
    db.commit()
    db.refresh(cliente)
    return _respuesta(cliente)


@router.get("/api/fidelizacion/clientes/{cliente_id}/movimientos", response_model=MovimientosPuntosPageResponse)
def list_movimientos_puntos(
    cliente_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> MovimientosPuntosPageResponse:
    """Historial de puntos del cliente, del mas reciente al mas antiguo."""
    if db.get(ClienteFidelizacionModel, cliente_id) is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    query = select(MovimientoPuntosModel).where(MovimientoPuntosModel.cliente_id == cliente_id)
    items, page_info = build_page(db, query, page, limit, MovimientoPuntosModel.id.desc())
    return MovimientosPuntosPageResponse(
        data=[
            MovimientoPuntosResponse(
                id=m.id, fecha=m.fecha, tipo=m.tipo, puntos=m.puntos, saldo=m.saldo, motivo=m.motivo,
                usuario=m.usuario, referencia_tipo=m.referencia_tipo, referencia_id=m.referencia_id,
            )
            for m in items
        ],
        page=page_info,
    )


@router.delete(
    "/api/fidelizacion/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> Response:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    cliente.activo = False
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="fidelizacion",
        entidad="cliente_fidelizacion",
        accion="desactivar",
        entidad_id=cliente.id,
        detalle=f"{cliente.nombre} ({cliente.puntos_acumulados} puntos)",
    )
    db.commit()
    return Response(status_code=204)


@router.put("/api/fidelizacion/clientes/{cliente_id}/reactivar", status_code=200)
def reactivar_cliente_fidelizacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> dict:
    cliente = db.execute(
        select(ClienteFidelizacionModel).where(ClienteFidelizacionModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    cliente.activo = True
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="fidelizacion",
        entidad="cliente_fidelizacion",
        accion="reactivar",
        entidad_id=cliente.id,
        detalle=cliente.nombre,
    )
    db.commit()
    return {"message": "Cliente reactivado"}
