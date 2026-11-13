"""Router "superadmin" que expone CRUD mínimo para tablas administrativas.
Protegido con require_roles('superadmin').
"""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.dependencies import AuthenticatedUser, require_roles
from src.api.services import usuarios as servicio_usuarios
from src.api.services.informes import MAX_DIAS, construir_informe, periodo_por_defecto
from src.infrastructure.database.connection import get_db

router = APIRouter(tags=["superadmin"])

# --- Schemas ---
class UsuarioSchema(BaseModel):
    id: int
    username: str
    rol: str
    activo: bool = True


class UsuarioCreate(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=8, max_length=128)]


class UsuarioUpdate(BaseModel):
    username: Annotated[str | None, Field(min_length=3, max_length=50)] = None
    password: Annotated[str | None, Field(min_length=8, max_length=128)] = None


class RankingVendedorSchema(BaseModel):
    vendedor: str
    ventas: int
    total_vendido: float


class RankingProductoSchema(BaseModel):
    producto_id: int
    producto: str
    unidades_vendidas: int
    total_vendido: float


class VentasInformeSchema(BaseModel):
    total: float
    transacciones: int
    a_credito: float
    de_contado: float


class CobradoInformeSchema(BaseModel):
    total: float
    efectivo: float
    transferencia: float
    tarjeta: float


class InformeTiendaSchema(BaseModel):
    ventas: VentasInformeSchema
    cobrado: CobradoInformeSchema
    gastos: float
    cobrado_menos_gastos: float
    por_cobrar: float
    vendedores: list[RankingVendedorSchema]
    mas_vendidos: list[RankingProductoSchema]
    menos_vendidos: list[RankingProductoSchema]


class InformeCarteraSchema(BaseModel):
    ventas: VentasInformeSchema
    cobrado: CobradoInformeSchema
    por_cobrar: float
    mas_vendidos: list[RankingProductoSchema]
    menos_vendidos: list[RankingProductoSchema]


class PeriodoInformeSchema(BaseModel):
    desde: date
    hasta: date


class InformesSuperadminResponse(BaseModel):
    periodo: PeriodoInformeSchema
    tienda: InformeTiendaSchema
    cartera: InformeCarteraSchema


# --- Usuarios (vendedores y admins): se desactivan, no se borran ---
def _rutas_de_usuarios(ruta: str, rol: str) -> None:
    """Las mismas rutas para vendedores y admins; la logica vive en services/usuarios.py."""

    @router.get(f"/api/superadmin/usuarios/{ruta}", response_model=list[UsuarioSchema], name=f"listar_{ruta}")
    def listar(db: Session = Depends(get_db), _: AuthenticatedUser = Depends(require_roles("superadmin"))) -> list[UsuarioSchema]:
        return [UsuarioSchema(**u) for u in servicio_usuarios.listar(db, rol)]

    @router.post(f"/api/superadmin/usuarios/{ruta}", response_model=UsuarioSchema, status_code=201, name=f"crear_{ruta}")
    def crear(
        payload: UsuarioCreate,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.crear(db, rol, payload.username, payload.password, current_user.username))

    @router.patch(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}", response_model=UsuarioSchema, name=f"editar_{ruta}")
    def editar(
        usuario_id: int,
        payload: UsuarioUpdate,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.editar(db, rol, usuario_id, payload.username, payload.password, current_user.username))

    @router.delete(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}", response_model=UsuarioSchema, name=f"desactivar_{ruta}")
    def desactivar(
        usuario_id: int,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        """Desactiva al usuario (no se borra) y le cierra las sesiones."""
        return UsuarioSchema(**servicio_usuarios.desactivar(db, rol, usuario_id, current_user.username))

    @router.put(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}/reactivar", response_model=UsuarioSchema, name=f"reactivar_{ruta}")
    def reactivar(
        usuario_id: int,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.reactivar(db, rol, usuario_id, current_user.username))

    @router.post(f"/api/superadmin/usuarios/{ruta}/{{usuario_id}}/cerrar-sesiones", response_model=UsuarioSchema, name=f"cerrar_sesiones_{ruta}")
    def cerrar_sesiones(
        usuario_id: int,
        db: Session = Depends(get_db),
        current_user: AuthenticatedUser = Depends(require_roles("superadmin")),
    ) -> UsuarioSchema:
        return UsuarioSchema(**servicio_usuarios.cerrar_sesiones(db, rol, usuario_id, current_user.username))


_rutas_de_usuarios("vendedores", "vendedor")
_rutas_de_usuarios("admins", "admin")


# --- Informes ---
@router.get("/api/superadmin/informes", response_model=InformesSuperadminResponse)
def informes_superadmin(
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("superadmin")),
) -> InformesSuperadminResponse:
    """Informe del periodo (por defecto el mes en curso), con la tienda y la cartera por separado."""
    inicio_mes, hoy = periodo_por_defecto()
    desde, hasta = desde or inicio_mes, hasta or hoy
    if desde > hasta:
        raise HTTPException(status_code=400, detail="La fecha inicial no puede ser posterior a la final")
    if (hasta - desde).days >= MAX_DIAS:
        raise HTTPException(status_code=400, detail=f"El periodo no puede pasar de {MAX_DIAS} dias")
    return InformesSuperadminResponse(**construir_informe(db, desde, hasta))
