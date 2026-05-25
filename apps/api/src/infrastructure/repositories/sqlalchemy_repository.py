"""Implementaciones concretas de repositorios usando SQLAlchemy."""

from __future__ import annotations

from abc import abstractmethod
from typing import Any, Generic, TypeVar, cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.domain.cliente import Cliente
from src.domain.producto import Producto
from src.domain.repositories.base_repository import BaseRepository
from src.domain.repositories.cliente_repository import ClienteRepository
from src.domain.repositories.producto_repository import ProductoRepository
from src.infrastructure.database.models import ClienteModel, ProductoModel

TDomain = TypeVar("TDomain")
TModel = TypeVar("TModel")


class SqlAlchemyRepository(BaseRepository[TDomain, int], Generic[TDomain, TModel]):
    """Base generica para CRUD con sesion inyectada de SQLAlchemy."""

    def __init__(self, db: Session, model_class: type[TModel]) -> None:
        """Inicializa repositorio con sesion y tipo de modelo ORM."""
        self.db = db
        self._model_class = model_class

    @abstractmethod
    def _to_model(self, entity: TDomain) -> TModel:
        """Convierte una entidad de dominio a modelo ORM."""

    @abstractmethod
    def _to_domain(self, model: TModel) -> TDomain:
        """Convierte un modelo ORM a entidad de dominio."""

    @abstractmethod
    def _find_model_for_update(self, entity: TDomain) -> TModel | None:
        """Encuentra la fila ORM que corresponde a la entidad a actualizar."""

    @abstractmethod
    def _apply_domain_updates(self, model: TModel, entity: TDomain) -> None:
        """Copia cambios desde dominio hacia el modelo ORM existente."""

    def add(self, entity: TDomain) -> TDomain:
        """Inserta una entidad en base de datos y retorna su version de dominio."""
        model = self._to_model(entity)
        self.db.add(model)
        self.db.commit()
        self.db.refresh(model)
        return self._to_domain(model)

    def get_by_id(self, entity_id: int) -> TDomain | None:
        """Recupera una entidad por ID; retorna None si no existe."""
        model_class = cast(type[Any], self._model_class)
        model = self.db.execute(select(self._model_class).where(model_class.id == entity_id)).scalar_one_or_none()
        if model is None:
            return None
        return self._to_domain(model)

    def list_all(self) -> list[TDomain]:
        """Lista todas las entidades de la tabla asociada."""
        models = self.db.execute(select(self._model_class)).scalars().all()
        return [self._to_domain(model) for model in models]

    def update(self, entity: TDomain) -> TDomain:
        """Actualiza una entidad; si no existe, la inserta como nueva."""
        model = self._find_model_for_update(entity)
        if model is None:
            return self.add(entity)

        self._apply_domain_updates(model, entity)
        self.db.commit()
        self.db.refresh(model)
        return self._to_domain(model)

    def delete(self, entity_id: int) -> None:
        """Desactiva (soft-delete) por ID; no falla si la entidad no existe."""
        model_class = cast(type[Any], self._model_class)
        model = self.db.execute(select(self._model_class).where(model_class.id == entity_id)).scalar_one_or_none()
        if model is None:
            return
        if hasattr(model, 'activo'):
            model.activo = False
        else:
            self.db.delete(model)
        self.db.commit()


class SqlAlchemyClienteRepository(
    SqlAlchemyRepository[Cliente, ClienteModel],
    ClienteRepository,
):
    """Repositorio SQLAlchemy para persistir clientes de dominio."""

    def __init__(self, db: Session) -> None:
        super().__init__(db=db, model_class=ClienteModel)

    def _to_model(self, entity: Cliente) -> ClienteModel:
        return ClienteModel(
            nombre=entity.nombre,
            documento=entity.documento,
            limite_credito=entity.limite_credito,
            deuda_total=entity.deuda_total,
            activo=getattr(entity, "activo", True),
        )

    def _to_domain(self, model: ClienteModel) -> Cliente:
        return Cliente(
            nombre=model.nombre,
            documento=model.documento,
            limite_credito=model.limite_credito,
            cliente_id=model.id,
            deuda_inicial=model.deuda_total,
        )

    def _find_model_for_update(self, entity: Cliente) -> ClienteModel | None:
        if entity.documento:
            return self.db.execute(select(ClienteModel).where(ClienteModel.documento == entity.documento)).scalar_one_or_none()

        return self.db.execute(select(ClienteModel).where(ClienteModel.nombre == entity.nombre)).scalar_one_or_none()

    def _apply_domain_updates(self, model: ClienteModel, entity: Cliente) -> None:
        model.nombre = entity.nombre
        model.documento = entity.documento
        model.limite_credito = entity.limite_credito
        model.deuda_total = entity.deuda_total

    def get_by_nombre(self, nombre: str) -> Cliente | None:
        """Busca cliente por nombre exacto y retorna None si no existe."""
        model = self.db.execute(select(ClienteModel).where(ClienteModel.nombre == nombre)).scalar_one_or_none()
        if model is None:
            return None
        return self._to_domain(model)



class SqlAlchemyProductoRepository(
    SqlAlchemyRepository[Producto, ProductoModel],
    ProductoRepository,
):
    """Repositorio SQLAlchemy para el modulo de inventario."""

    def __init__(self, db: Session) -> None:
        super().__init__(db=db, model_class=ProductoModel)

    def _to_model(self, entity: Producto) -> ProductoModel:
        return ProductoModel(
            nombre=entity.nombre,
            codigo_barras=entity.codigo_barras,
            precio_costo=entity.precio_costo,
            precio_venta=entity.precio_venta,
            catalogo=entity.catalogo,
            stock_actual=entity.stock_actual,
            stock_minimo=entity.stock_minimo,
        )

    def _to_domain(self, model: ProductoModel) -> Producto:
        return Producto(
            nombre=model.nombre,
            codigo_barras=model.codigo_barras,
            precio_costo=model.precio_costo,
            precio_venta=model.precio_venta,
            stock=model.stock_actual,
            stock_minimo=model.stock_minimo,
            catalogo=model.catalogo,
            producto_id=model.id,
        )

    def _find_model_for_update(self, entity: Producto) -> ProductoModel | None:
        if entity.id is not None:
            return self.db.execute(select(ProductoModel).where(ProductoModel.id == entity.id)).scalar_one_or_none()

        return self.db.execute(select(ProductoModel).where(ProductoModel.nombre == entity.nombre)).scalar_one_or_none()

    def _apply_domain_updates(self, model: ProductoModel, entity: Producto) -> None:
        model.nombre = entity.nombre
        model.codigo_barras = entity.codigo_barras
        model.precio_costo = entity.precio_costo
        model.precio_venta = entity.precio_venta
        model.catalogo = entity.catalogo
        model.stock_actual = entity.stock_actual
        model.stock_minimo = entity.stock_minimo

    def get_by_nombre(self, nombre: str) -> Producto | None:
        """Busca un producto por nombre exacto."""
        model = self.db.execute(select(ProductoModel).where(ProductoModel.nombre == nombre)).scalar_one_or_none()
        if model is None:
            return None
        return self._to_domain(model)

    def update_stock(self, producto_id: int, delta: int) -> Producto | None:
        """Ajusta el inventario por delta positivo o negativo."""
        model = self.db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
        if model is None:
            return None

        nuevo_stock = model.stock_actual + delta
        if nuevo_stock < 0:
            raise ValueError("El stock no puede quedar negativo")

        model.stock_actual = nuevo_stock
        self.db.commit()
        self.db.refresh(model)
        return self._to_domain(model)

    def update_precio_venta(
        self,
        producto_id: int,
        precio_venta: float,
    ) -> Producto | None:
        """Actualiza precio de venta para edicion inline desde UI."""
        if precio_venta < 0:
            raise ValueError("El precio de venta no puede ser negativo")

        model = self.db.execute(select(ProductoModel).where(ProductoModel.id == producto_id)).scalar_one_or_none()
        if model is None:
            return None

        model.precio_venta = precio_venta
        self.db.commit()
        self.db.refresh(model)
        return self._to_domain(model)
