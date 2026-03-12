class Producto:
    """Gestiona datos de inventario y precios de productos."""

    def __init__(
        self,
        nombre: str,
        precio_costo: float,
        precio_venta: float,
        stock: int = 0,
        stock_minimo: int = 0,
        producto_id: int | None = None,
    ) -> None:
        """Inicializa el producto validando reglas de inventario.

        Args:
            nombre: Nombre comercial del producto.
            precio_costo: Costo de compra unitario.
            precio_venta: Precio de venta al publico.
            stock: Stock inicial (retrocompatible con pruebas existentes).
            stock_minimo: Umbral minimo para alertas de reposicion.
            producto_id: Identificador persistente si ya existe en base de datos.
        """
        if not nombre or not nombre.strip():
            raise ValueError("El nombre del producto es obligatorio")
        if precio_costo < 0 or precio_venta < 0:
            raise ValueError("Los precios no pueden ser negativos")
        if stock < 0:
            raise ValueError("El stock no puede ser negativo")
        if stock_minimo < 0:
            raise ValueError("El stock minimo no puede ser negativo")

        self.id = producto_id
        self._nombre = nombre.strip()
        self._precio_costo = float(precio_costo)
        self._precio_venta = float(precio_venta)
        self._stock_actual = int(stock)
        self._stock_minimo = int(stock_minimo)

    def __str__(self) -> str:
        return f"{self.nombre} (Stock: {self.stock_actual})"

    @property
    def nombre(self) -> str:
        """Nombre del producto."""
        return self._nombre

    @property
    def stock(self) -> int:
        """Alias retrocompatible de stock actual."""
        return self._stock_actual

    @property
    def stock_actual(self) -> int:
        """Cantidad actual disponible en inventario."""
        return self._stock_actual

    @property
    def stock_minimo(self) -> int:
        """Umbral de alerta para stock bajo."""
        return self._stock_minimo

    @property
    def stock_critico(self) -> bool:
        """Indica si el inventario ya llego al umbral minimo."""
        return self.stock_actual <= self.stock_minimo

    @property
    def precio_costo(self) -> float:
        """Precio de costo unitario."""
        return self._precio_costo

    @property
    def precio_venta(self) -> float:
        """Precio final al público."""
        return self._precio_venta

    def actualizar_precio_venta(self, nuevo_precio: float) -> None:
        """Modifica el precio de venta para ajustes rapidos de mostrador."""
        if nuevo_precio < 0:
            raise ValueError("El precio de venta no puede ser negativo")
        self._precio_venta = float(nuevo_precio)

    def ajustar_stock(self, delta: int) -> None:
        """Ajusta stock por entradas/salidas manuales.

        Args:
            delta: Variacion positiva o negativa del inventario.
        """
        nuevo_stock = self._stock_actual + int(delta)
        if nuevo_stock < 0:
            raise ValueError(f"Stock insuficiente de {self._nombre}")
        self._stock_actual = nuevo_stock

    def reducir_stock(self, cantidad: int) -> None:
        """Resta unidades del inventario tras una venta.

        Args:
            cantidad: Unidades a descontar.
        """
        if cantidad < 0:
            raise ValueError("La cantidad no puede ser negativa")
        self.ajustar_stock(-cantidad)

    def aumentar_stock(self, cantidad: int) -> None:
        """Suma unidades al inventario por reposicion."""
        if cantidad < 0:
            raise ValueError("La cantidad no puede ser negativa")
        self.ajustar_stock(cantidad)


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
