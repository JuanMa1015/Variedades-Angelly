"""Router CRUD para gastos operativos.

Un gasto solo resta del efectivo de la caja si se pagó en efectivo (lo que sale del cajón). Los pagados por
transferencia o tarjeta quedan registrados pero no descuadran el cierre. Un gasto en efectivo exige caja abierta
(sin turno ese dinero no entraría a ningún cuadre) y, una vez en un turno, no se borra: se anula con motivo y
autorización de un administrador, igual que las ventas y los abonos.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta, timezone
import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.limiter import limiter, login_rate_limit
from src.api.pagination import PageInfo, build_page, search_filter
from src.api.schemas.anulacion import AnularRequest
from src.api.services.anulacion import anular_gasto, quien_autoriza
from src.api.services.auditoria import registrar_auditoria
from src.api.services.venta_reglas import caja_abierta_id, exigir_caja_abierta
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import GastoModel

router = APIRouter(tags=["gastos"])

MONTO_MAXIMO = 999_999_999
MedioPago = Literal["efectivo", "transferencia", "tarjeta"]
# Colombia no tiene horario de verano: el mes de un gasto se cuenta con la hora de Bogota (UTC-5).
BOGOTA = timezone(timedelta(hours=-5))
_MES = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


class GastoResponse(BaseModel):
    id: int
    categoria: str
    descripcion: str
    monto: float
    fecha: datetime
    registrado_por: str
    medio_pago: str = "efectivo"
    caja_id: int | None = None
    anulado: bool = False
    anulado_en: datetime | None = None
    anulado_por: str | None = None
    autorizado_por: str | None = None
    motivo_anulacion: str | None = None


class GastoPageResponse(BaseModel):
    data: list[GastoResponse]
    page: PageInfo


class GastoCategoriaResumen(BaseModel):
    categoria: str
    total: float
    registros: int


class GastoMesAnterior(BaseModel):
    mes: str
    total: float
    registros: int


class GastoResumenResponse(BaseModel):
    mes: str
    total: float
    registros: int
    anulados: int
    por_categoria: list[GastoCategoriaResumen]
    total_efectivo: float
    total_otros_medios: float
    mes_anterior: GastoMesAnterior
    # Cuanto subio (+) o bajo (-) el total frente al mes anterior; None si el anterior fue cero.
    variacion_pct: float | None


class GastoCreateRequest(BaseModel):
    categoria: Annotated[str, Field(min_length=3, max_length=50)]
    descripcion: Annotated[str, Field(min_length=4, max_length=255)]
    monto: Annotated[float, Field(gt=0, le=MONTO_MAXIMO)]
    medio_pago: MedioPago = "efectivo"
    # Solo para gastos que no salieron del cajon (transferencia o tarjeta) pagados otro dia.
    fecha: date | None = None


class GastoUpdateRequest(BaseModel):
    categoria: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    descripcion: Annotated[str | None, Field(min_length=4, max_length=255)] = None
    monto: Annotated[float | None, Field(gt=0, le=MONTO_MAXIMO)] = None


def _to_response(gasto: GastoModel) -> GastoResponse:
    return GastoResponse(
        id=gasto.id,
        categoria=gasto.categoria,
        descripcion=gasto.descripcion,
        monto=float(gasto.monto),
        fecha=gasto.fecha,
        registrado_por=gasto.registrado_por,
        medio_pago=gasto.medio_pago,
        caja_id=gasto.caja_id,
        anulado=bool(gasto.anulado),
        anulado_en=gasto.anulado_en,
        anulado_por=gasto.anulado_por,
        autorizado_por=gasto.autorizado_por,
        motivo_anulacion=gasto.motivo_anulacion,
    )


def _normalizar_categoria(valor: str) -> str:
    categoria = " ".join(valor.split()).lower()
    if len(categoria) < 3:
        raise HTTPException(status_code=400, detail="La categoria debe tener al menos 3 caracteres")
    return categoria


def _normalizar_descripcion(valor: str) -> str:
    descripcion = " ".join(valor.split())
    if len(descripcion) < 4:
        raise HTTPException(status_code=400, detail="La descripcion debe tener al menos 4 caracteres")
    return descripcion


def _fecha_del_gasto(fecha: date | None, medio_pago: str) -> datetime | None:
    """None = ahora. Una fecha propia solo vale para gastos que no salieron del cajon."""
    if fecha is None:
        return None
    hoy = datetime.now(UTC).date()
    if fecha > hoy + timedelta(days=1):
        raise HTTPException(status_code=400, detail="La fecha del gasto no puede ser futura")
    cerca_de_hoy = abs((fecha - hoy).days) <= 1
    if medio_pago == "efectivo":
        if not cerca_de_hoy:
            raise HTTPException(
                status_code=400,
                detail="Un gasto en efectivo se registra con la fecha de hoy: sale del cajon del turno abierto",
            )
        return None
    # Mediodia de Bogota (17:00 UTC): el dia se ve igual en pantalla y queda lejos de los limites del mes.
    return None if cerca_de_hoy else datetime.combine(fecha, time(17, 0))


def _mes_actual() -> str:
    return datetime.now(BOGOTA).strftime("%Y-%m")


def _mes_anterior(mes: str) -> str:
    anio, numero = int(mes[:4]), int(mes[5:])
    return f"{anio - 1}-12" if numero == 1 else f"{anio}-{numero - 1:02d}"


def _rango_utc_del_mes(mes: str) -> tuple[datetime, datetime]:
    """Inicio (incluido) y fin (excluido) del mes de Bogota, como UTC sin zona (como se guarda `fecha`)."""
    anio, numero = int(mes[:4]), int(mes[5:])
    inicio = datetime(anio, numero, 1, tzinfo=BOGOTA)
    fin = datetime(anio + 1, 1, 1, tzinfo=BOGOTA) if numero == 12 else datetime(anio, numero + 1, 1, tzinfo=BOGOTA)
    return inicio.astimezone(UTC).replace(tzinfo=None), fin.astimezone(UTC).replace(tzinfo=None)


def _validar_mes(mes: str | None) -> str | None:
    if mes is None:
        return None
    if not _MES.match(mes):
        raise HTTPException(status_code=422, detail="El mes debe tener el formato AAAA-MM")
    return mes


def _filtrar_por_fecha(query, fecha_desde: date | None, fecha_hasta: date | None):
    if fecha_desde:
        query = query.where(GastoModel.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.where(GastoModel.fecha <= fecha_hasta)
    return query


@router.get("/api/gastos", response_model=list[GastoResponse])
def list_gastos(
    db: Session = Depends(get_db),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> list[GastoResponse]:
    query = _filtrar_por_fecha(select(GastoModel), fecha_desde, fecha_hasta)
    gastos = db.execute(query.order_by(GastoModel.fecha.desc())).scalars().all()
    return [_to_response(gasto) for gasto in gastos]


@router.get("/api/gastos/paginados", response_model=GastoPageResponse)
def list_gastos_paginados(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    mes: str | None = Query(default=None, description="AAAA-MM, con la hora de Bogota"),
    categoria: str | None = Query(default=None, max_length=50),
    medio_pago: MedioPago | None = Query(default=None),
    estado: Literal["todos", "vigentes", "anulados"] = Query(default="todos"),
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> GastoPageResponse:
    query = _filtrar_por_fecha(select(GastoModel), fecha_desde, fecha_hasta)
    if _validar_mes(mes):
        inicio, fin = _rango_utc_del_mes(mes)
        query = query.where(GastoModel.fecha >= inicio, GastoModel.fecha < fin)
    if categoria:
        query = query.where(GastoModel.categoria == " ".join(categoria.split()).lower())
    if medio_pago:
        query = query.where(GastoModel.medio_pago == medio_pago)
    if estado != "todos":
        query = query.where(GastoModel.anulado.is_(estado == "anulados"))
    termino = (q or "").strip()
    if termino:
        query = query.where(or_(*search_filter(termino, GastoModel.descripcion, GastoModel.categoria, GastoModel.registrado_por)))
    items, page_info = build_page(db, query, page, limit, GastoModel.fecha.desc())
    return GastoPageResponse(data=[_to_response(gasto) for gasto in items], page=page_info)


@router.get("/api/gastos/resumen", response_model=GastoResumenResponse)
def resumen_gastos(
    mes: str | None = Query(default=None, description="AAAA-MM, con la hora de Bogota; por defecto el mes actual"),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> GastoResumenResponse:
    """Totales del mes sobre TODOS los gastos (no solo la pagina visible). Los anulados no cuentan."""
    mes = _validar_mes(mes) or _mes_actual()
    anterior = _mes_anterior(mes)

    def vigentes_del(mes_consultado: str):
        inicio, fin = _rango_utc_del_mes(mes_consultado)
        return (GastoModel.fecha >= inicio, GastoModel.fecha < fin, GastoModel.anulado.is_(False))

    por_categoria = db.execute(
        select(GastoModel.categoria, func.sum(GastoModel.monto), func.count())
        .where(*vigentes_del(mes))
        .group_by(GastoModel.categoria),
    ).all()
    por_medio = dict(
        db.execute(
            select(GastoModel.medio_pago, func.sum(GastoModel.monto)).where(*vigentes_del(mes)).group_by(GastoModel.medio_pago),
        ).all(),
    )
    total_anterior, registros_anterior = db.execute(
        select(func.coalesce(func.sum(GastoModel.monto), 0), func.count()).where(*vigentes_del(anterior)),
    ).one()
    inicio, fin = _rango_utc_del_mes(mes)
    anulados = db.execute(
        select(func.count()).select_from(GastoModel).where(
            GastoModel.fecha >= inicio, GastoModel.fecha < fin, GastoModel.anulado.is_(True),
        ),
    ).scalar_one()

    categorias = sorted(
        (GastoCategoriaResumen(categoria=c, total=float(t or 0), registros=n) for c, t, n in por_categoria),
        key=lambda item: item.total,
        reverse=True,
    )
    total = round(sum(item.total for item in categorias), 2)
    efectivo = float(por_medio.get("efectivo") or 0)
    total_anterior = float(total_anterior or 0)
    return GastoResumenResponse(
        mes=mes,
        total=total,
        registros=sum(item.registros for item in categorias),
        anulados=anulados,
        por_categoria=categorias,
        total_efectivo=efectivo,
        total_otros_medios=round(total - efectivo, 2),
        mes_anterior=GastoMesAnterior(mes=anterior, total=total_anterior, registros=registros_anterior),
        variacion_pct=round((total - total_anterior) / total_anterior * 100, 1) if total_anterior > 0 else None,
    )


@router.post("/api/gastos", response_model=GastoResponse, status_code=201)
def create_gasto(
    payload: GastoCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> GastoResponse:
    categoria = _normalizar_categoria(payload.categoria)
    descripcion = _normalizar_descripcion(payload.descripcion)
    fecha = _fecha_del_gasto(payload.fecha, payload.medio_pago)
    if payload.medio_pago == "efectivo":
        exigir_caja_abierta(db, "registrar gastos en efectivo")

    gasto = GastoModel(
        categoria=categoria,
        descripcion=descripcion,
        monto=round(payload.monto, 2),
        medio_pago=payload.medio_pago,
        registrado_por=current_user.username,
    )
    if fecha is not None:
        gasto.fecha = fecha
    db.add(gasto)
    db.flush()
    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="gastos",
        entidad="gasto",
        accion="crear",
        entidad_id=gasto.id,
        detalle=f"{categoria}: {gasto.monto} por {gasto.medio_pago}. {descripcion}",
    )
    db.commit()
    db.refresh(gasto)
    return _to_response(gasto)


@router.patch("/api/gastos/{gasto_id}", response_model=GastoResponse)
def update_gasto(
    gasto_id: int,
    payload: GastoUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> GastoResponse:
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id).with_for_update(),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    if gasto.anulado:
        raise HTTPException(status_code=409, detail="El gasto esta anulado y no se puede editar")
    # El monto de un gasto en efectivo ya cuadrado en un turno cerrado no se toca: el cierre quedo guardado.
    if payload.monto is not None and gasto.medio_pago == "efectivo" and gasto.caja_id not in (None, caja_abierta_id(db)):
        raise HTTPException(status_code=409, detail="El gasto es de un turno de caja ya cerrado: no se puede cambiar su monto")

    cambios: list[str] = []
    if payload.categoria is not None:
        categoria = _normalizar_categoria(payload.categoria)
        if categoria != gasto.categoria:
            cambios.append(f"categoria: {gasto.categoria} -> {categoria}")
            gasto.categoria = categoria
    if payload.descripcion is not None:
        descripcion = _normalizar_descripcion(payload.descripcion)
        if descripcion != gasto.descripcion:
            cambios.append("descripcion editada")
            gasto.descripcion = descripcion
    if payload.monto is not None:
        monto = round(payload.monto, 2)
        if monto != float(gasto.monto):
            cambios.append(f"monto: {float(gasto.monto)} -> {monto}")
            gasto.monto = monto

    if cambios:
        registrar_auditoria(
            db,
            usuario=current_user.username,
            modulo="gastos",
            entidad="gasto",
            accion="actualizar",
            entidad_id=gasto.id,
            detalle="; ".join(cambios),
        )
    db.commit()
    db.refresh(gasto)
    return _to_response(gasto)


@router.post("/api/gastos/{gasto_id}/anular", response_model=GastoResponse)
@limiter.limit(login_rate_limit())
def anular_gasto_endpoint(
    request: Request,
    gasto_id: int,
    payload: AnularRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("vendedor", "superadmin")),
) -> GastoResponse:
    """Anula un gasto con motivo y autorizacion: deja de restar de la caja y queda el registro."""
    with db.begin():
        autorizado_por = quien_autoriza(db, current_user, payload.autorizador_usuario, payload.autorizador_password)
        gasto = anular_gasto(
            db,
            gasto_id,
            solicitante=current_user.username,
            autorizado_por=autorizado_por,
            motivo=payload.motivo.strip(),
        )
        db.flush()
        return _to_response(gasto)


@router.delete(
    "/api/gastos/{gasto_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_gasto(
    gasto_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> Response:
    gasto = db.execute(
        select(GastoModel).where(GastoModel.id == gasto_id).with_for_update(),
    ).scalar_one_or_none()
    if gasto is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    if gasto.caja_id is not None:
        raise HTTPException(status_code=409, detail="El gasto ya hace parte de un turno de caja: anulalo en vez de borrarlo")

    registrar_auditoria(
        db,
        usuario=current_user.username,
        modulo="gastos",
        entidad="gasto",
        accion="eliminar",
        entidad_id=gasto.id,
        detalle=f"{gasto.categoria}: {float(gasto.monto)}. {gasto.descripcion}",
    )
    db.delete(gasto)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
