from datetime import datetime
from typing import List
from .transaccion import Venta


class Abono:
    """Representa un pago parcial de deuda."""

    def __init__(self, monto: float) -> None:
        if monto <= 0:
            raise ValueError("El monto debe ser positivo")
        self.monto = monto
        self.fecha = datetime.now()


class Cliente:
    """Gestiona el perfil del deudor y sus saldos."""

    def __init__(
        self,
        nombre: str,
        limite_credito: float,
        documento: str | None = None,
        cliente_id: int | None = None,
        deuda_inicial: float = 0.0,
    ) -> None:
        """Inicializa el cliente con un cupo máximo de crédito."""
        self.id = cliente_id
        self.nombre = nombre
        self.documento = documento
        self.limite_credito = limite_credito
        self._deuda_inicial = float(deuda_inicial)
        self.ventas_credito: List[Venta] = []
        self.abonos: List[Abono] = []

    @property
    def deuda_total(self) -> float:
        """Calcula el saldo pendiente restando abonos de ventas."""
        total_fiado = sum(v.obtener_total() for v in self.ventas_credito)
        total_abonado = sum(a.monto for a in self.abonos)
        return self._deuda_inicial + total_fiado - total_abonado

    def establecer_deuda(self, deuda_actual: float) -> None:
        """Sincroniza deuda base desde persistencia."""
        if deuda_actual < 0:
            raise ValueError("La deuda no puede ser negativa")
        self._deuda_inicial = float(deuda_actual)

    def registrar_venta_credito(self, venta: Venta) -> None:
        """Asocia una venta al crédito si no supera el límite."""
        if not venta.es_credito:
            raise ValueError("Venta no marcada como crédito")
        if self.deuda_total + venta.obtener_total() > self.limite_credito:
            raise ValueError("Límite de crédito excedido")
        self.ventas_credito.append(venta)

    def registrar_abono(self, monto: float) -> None:
        """Registra un pago y reduce la deuda."""
        if monto > self.deuda_total:
            raise ValueError("El abono supera la deuda")
        self.abonos.append(Abono(monto))
