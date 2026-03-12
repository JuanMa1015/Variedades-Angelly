"""Implementaciones concretas de repositorios usando SQLAlchemy."""

from __future__ import annotations

from abc import abstractmethod
from datetime import datetime
from typing import Any, Generic, TypeVar, cast

from sqlalchemy.orm import Session

from src.domain.cliente import Cliente
from src.domain.producto import Producto
from src.domain.repositories.base_repository import BaseRepository
from src.domain.repositories.cliente_repository import ClienteRepository
from src.domain.repositories.producto_repository import ProductoRepository
from src.domain.repositories.usuario_repository import UsuarioRepository
from src.domain.usuario import Usuario
from src.infrastructure.database.models import ClienteModel, ProductoModel, UsuarioModel

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
        model = (
            self.db.query(self._model_class)
            .filter(model_class.id == entity_id)
            .first()
        )
        if model is None:
            return None
        return self._to_domain(model)

    def list_all(self) -> list[TDomain]:
        """Lista todas las entidades de la tabla asociada."""
        models = self.db.query(self._model_class).all()
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
        """Elimina por ID; no falla si la entidad no existe."""
        model_class = cast(type[Any], self._model_class)
        model = (
            self.db.query(self._model_class)
            .filter(model_class.id == entity_id)
            .first()
        )
        if model is None:
            return
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
            return (
                self.db.query(ClienteModel)
                .filter(ClienteModel.documento == entity.documento)
                .first()
            )

        return (
            self.db.query(ClienteModel)
            .filter(ClienteModel.nombre == entity.nombre)
            .first()
        )

    def _apply_domain_updates(self, model: ClienteModel, entity: Cliente) -> None:
        model.nombre = entity.nombre
        model.documento = entity.documento
        model.limite_credito = entity.limite_credito
        model.deuda_total = entity.deuda_total

    def get_by_nombre(self, nombre: str) -> Cliente | None:
        """Busca cliente por nombre exacto y retorna None si no existe."""
        model = self.db.query(ClienteModel).filter(ClienteModel.nombre == nombre).first()
        if model is None:
            return None
        return self._to_domain(model)


class SqlAlchemyUsuarioRepository(
    SqlAlchemyRepository[Usuario, UsuarioModel],
    UsuarioRepository,
):
    """Repositorio SQLAlchemy para persistir usuarios de dominio."""

    def __init__(self, db: Session) -> None:
        super().__init__(db=db, model_class=UsuarioModel)

    def _to_model(self, entity: Usuario) -> UsuarioModel:
        return UsuarioModel(
            username=entity.username,
            email=entity.email,
            rol=entity.rol,
            nombre_completo=entity.nombre_completo,
            activo=entity.activo,
            fecha_registro=entity.fecha_registro,
        )

    def _to_domain(self, model: UsuarioModel) -> Usuario:
        usuario = Usuario(
            username=model.username,
            email=model.email,
            rol=model.rol,
            nombre_completo=model.nombre_completo,
        )
        usuario.activo = model.activo
        usuario.fecha_registro = model.fecha_registro or datetime.utcnow()
        return usuario

    def _find_model_for_update(self, entity: Usuario) -> UsuarioModel | None:
        return (
            self.db.query(UsuarioModel)
            .filter(UsuarioModel.username == entity.username)
            .first()
        )

    def _apply_domain_updates(self, model: UsuarioModel, entity: Usuario) -> None:
        model.email = entity.email
        model.rol = entity.rol
        model.nombre_completo = entity.nombre_completo
        model.activo = entity.activo
        model.fecha_registro = entity.fecha_registro

    def get_by_username(self, username: str) -> Usuario | None:
        """Busca usuario por username unico y retorna None si no existe."""
        model = (
            self.db.query(UsuarioModel)
            .filter(UsuarioModel.username == username)
            .first()
        )
        if model is None:
            return None
        return self._to_domain(model)

    def get_by_email(self, email: str) -> Usuario | None:
        """Busca usuario por email y retorna None si no existe."""
        model = self.db.query(UsuarioModel).filter(UsuarioModel.email == email).first()
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
            precio_costo=entity.precio_costo,
            precio_venta=entity.precio_venta,
            stock_actual=entity.stock_actual,
            stock_minimo=entity.stock_minimo,
        )

    def _to_domain(self, model: ProductoModel) -> Producto:
        return Producto(
            nombre=model.nombre,
            precio_costo=model.precio_costo,
            precio_venta=model.precio_venta,
            stock=model.stock_actual,
            stock_minimo=model.stock_minimo,
            producto_id=model.id,
        )

    def _find_model_for_update(self, entity: Producto) -> ProductoModel | None:
        if entity.id is not None:
            return (
                self.db.query(ProductoModel)
                .filter(ProductoModel.id == entity.id)
                .first()
            )

        return (
            self.db.query(ProductoModel)
            .filter(ProductoModel.nombre == entity.nombre)
            .first()
        )

    def _apply_domain_updates(self, model: ProductoModel, entity: Producto) -> None:
        model.nombre = entity.nombre
        model.precio_costo = entity.precio_costo
        model.precio_venta = entity.precio_venta
        model.stock_actual = entity.stock_actual
        model.stock_minimo = entity.stock_minimo

    def get_by_nombre(self, nombre: str) -> Producto | None:
        """Busca un producto por nombre exacto."""
        model = self.db.query(ProductoModel).filter(ProductoModel.nombre == nombre).first()
        if model is None:
            return None
        return self._to_domain(model)

    def update_stock(self, producto_id: int, delta: int) -> Producto | None:
        """Ajusta el inventario por delta positivo o negativo."""
        model = self.db.query(ProductoModel).filter(ProductoModel.id == producto_id).first()
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

        model = self.db.query(ProductoModel).filter(ProductoModel.id == producto_id).first()
        if model is None:
            return None

        model.precio_venta = precio_venta
        self.db.commit()
        self.db.refresh(model)
        return self._to_domain(model)
