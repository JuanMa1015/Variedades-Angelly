"""Entidad de dominio para apertura y cierre de caja."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class CierreCaja:
    """Representa el estado de caja en un turno."""

    id: int | None
    monto_inicial: float
    monto_ventas_efectivo: float
    monto_ventas_transferencia: float
    monto_gastos: float
    monto_cierre: float | None
    fecha_apertura: datetime
    fecha_cierre: datetime | None
    abierto_por: str
    cerrado_por: str | None

    @property
    def esta_abierta(self) -> bool:
        """Indica si la caja sigue abierta (no se ha cerrado)."""
        return self.fecha_cierre is None

    @property
    def total_ingresos(self) -> float:
        """Total de ventas en efectivo + transferencia."""
        return self.monto_ventas_efectivo + self.monto_ventas_transferencia

    @property
    def saldo_esperado(self) -> float:
        """Monto que deberia haber en caja: inicial + ventas - gastos."""
        return self.monto_inicial + self.total_ingresos - self.monto_gastos

    def cerrar(
        self,
        monto_cierre: float,
        cerrado_por: str,
        fecha_cierre: datetime | None = None,
    ) -> CierreCaja:
        """Cierra la caja validando el monto final."""
        if self.fecha_cierre is not None:
            raise ValueError("La caja ya esta cerrada")
        if monto_cierre < 0:
            raise ValueError("El monto de cierre no puede ser negativo")
        return CierreCaja(
            id=self.id,
            monto_inicial=self.monto_inicial,
            monto_ventas_efectivo=self.monto_ventas_efectivo,
            monto_ventas_transferencia=self.monto_ventas_transferencia,
            monto_gastos=self.monto_gastos,
            monto_cierre=monto_cierre,
            fecha_apertura=self.fecha_apertura,
            fecha_cierre=fecha_cierre or datetime.now(),
            abierto_por=self.abierto_por,
            cerrado_por=cerrado_por,
        )
