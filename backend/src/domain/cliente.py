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

    def __init__(self, nombre: str, limite_credito: float) -> None:
        """Inicializa el cliente con un cupo máximo de crédito."""
        self.nombre = nombre
        self.limite_credito = limite_credito
        self.ventas_credito: List[Venta] = []
        self.abonos: List[Abono] = []

    @property
    def deuda_total(self) -> float:
        """Calcula el saldo pendiente restando abonos de ventas."""
        total_fiado = sum(v.obtener_total() for v in self.ventas_credito)
        total_abonado = sum(a.monto for a in self.abonos)
        return total_fiado - total_abonado

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
