class Producto:
    """Gestiona los datos de artículos e inventario."""

    def __init__(
        self, nombre: str, precio_costo: float, precio_venta: float, stock: int = 0
    ) -> None:
        """Inicializa el producto validando precios no negativos."""
        if precio_costo < 0 or precio_venta < 0:
            raise ValueError("Los precios no pueden ser negativos")
        self._nombre = nombre
        self._precio_costo = precio_costo
        self._precio_venta = precio_venta
        self._stock = stock

    def __str__(self) -> str:
        return f"{self.nombre} (Stock: {self.stock})"

    @property
    def nombre(self) -> str:
        """Nombre del producto."""
        return self._nombre

    @property
    def stock(self) -> int:
        """Cantidad actual en bodega."""
        return self._stock

    @property
    def precio_venta(self) -> float:
        """Precio final al público."""
        return self._precio_venta

    def reducir_stock(self, cantidad: int) -> None:
        """Resta unidades del inventario tras una venta.

        Args:
            cantidad: Unidades a descontar.
        """
        if cantidad > self._stock:
            raise ValueError(f"Stock insuficiente de {self._nombre}")
        self._stock -= cantidad


class ItemVenta:
    """Detalle de un producto en una transacción específica."""

    def __init__(self, producto: Producto, cantidad: int) -> None:
        """Crea el item capturando el precio actual del producto."""
        self.producto = producto
        self.cantidad = cantidad
        self.precio_aplicado = producto.precio_venta

    def subtotal(self) -> float:
        """Calcula el costo total del item."""
        return self.precio_aplicado * self.cantidad
