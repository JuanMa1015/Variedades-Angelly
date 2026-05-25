"""Router de clientes de cartera."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.domain.cliente import Cliente
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import AbonoCarteraModel, ClienteModel, VentaModel
from src.infrastructure.repositories.sqlalchemy_repository import SqlAlchemyClienteRepository
from src.api.routers.cartera_shared import to_cliente_model_response, to_cliente_response
from src.api.schemas.cartera import ClienteCreateRequest, ClienteResponse, ClienteUpdateRequest

router = APIRouter(tags=["clientes-cartera-clientes"])


@router.get("/api/clientes", response_model=list[ClienteResponse])
def list_clientes(
    db: Session = Depends(get_db),
    include_inactivos: bool = Query(default=False),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> list[ClienteResponse]:
    query = select(ClienteModel)
    if not include_inactivos:
        query = query.where(ClienteModel.activo == True)
    clientes = db.execute(
        query.order_by(ClienteModel.nombre.asc()),
    ).scalars().all()

    compras_por_cliente_rows = db.execute(
        select(
            VentaModel.cliente_id,
            func.count(VentaModel.id).label("compras_cantidad"),
            func.coalesce(func.sum(VentaModel.total), 0).label("compras_total"),
        )
        .where(VentaModel.cliente_id.is_not(None))
        .group_by(VentaModel.cliente_id),
    ).all()

    compras_por_cliente: dict[int, tuple[int, float]] = {
        int(row.cliente_id): (int(row.compras_cantidad or 0), float(row.compras_total or 0))
        for row in compras_por_cliente_rows
        if row.cliente_id is not None
    }

    return [
        to_cliente_model_response(
            cliente,
            compras_total=compras_por_cliente.get(cliente.id, (0, 0.0))[1],
            compras_cantidad=compras_por_cliente.get(cliente.id, (0, 0.0))[0],
        )
        for cliente in clientes
    ]


@router.post("/api/clientes", response_model=ClienteResponse, status_code=201)
@router.post("/api/cartera/clientes", response_model=ClienteResponse, status_code=201)
def create_cliente(
    payload: ClienteCreateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteResponse:
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

    return to_cliente_model_response(cliente)


@router.patch("/api/cartera/clientes/{cliente_id}", response_model=ClienteResponse)
def update_cliente_cartera(
    cliente_id: int,
    payload: ClienteUpdateRequest,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteResponse:
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
        cliente.limite_credito = payload.limite_credito

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflicto de datos al actualizar cliente") from exc

    db.refresh(cliente)
    return to_cliente_model_response(cliente)


@router.delete(
    "/api/cartera/clientes/{cliente_id}",
    status_code=204,
    response_class=Response,
    response_model=None,
)
def delete_cliente_cartera(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> Response:
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

    cliente.activo = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/api/clientes/{cliente_id}/reactivar", status_code=200)
def reactivar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> dict:
    cliente = db.execute(
        select(ClienteModel).where(ClienteModel.id == cliente_id),
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    cliente.activo = True
    db.commit()
    return {"message": "Cliente reactivado"}


@router.get("/api/clientes/{nombre}", response_model=ClienteResponse)
def get_cliente_por_nombre(
    nombre: str,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "superadmin")),
) -> ClienteResponse:
    repository = SqlAlchemyClienteRepository(db)
    cliente = repository.get_by_nombre(nombre)

    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return to_cliente_response(cliente)
