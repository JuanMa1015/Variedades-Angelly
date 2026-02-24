from src.domain.enums import RolUsuario, TipoMovimiento, CategoriaGasto
from src.domain.usuario import Usuario
from src.domain.producto import Producto, ItemVenta
from src.domain.transaccion import Venta, Gasto
from src.domain.cliente import Cliente


def ejecutar_pruebas():
    print("--- Iniciando Pruebas de Dominio ---")

    # 1. Prueba de Usuario
    admin = Usuario("anaadmin", "ana@tienda.com", RolUsuario.ADMIN)
    print(f"Usuario creado: {admin}")

    # 2. Prueba de Inventario
    leche = Producto("Leche Entera", precio_costo=2500, precio_venta=3200, stock=10)
    print(f"Producto: {leche}")

    # 3. Prueba de Cliente y Crédito
    pepe = Cliente("Don Pepe", limite_credito=50000)

    # Simular una venta a crédito
    venta_fiada = Venta("Compra de lunes", es_credito=True)
    venta_fiada.agregar_item(ItemVenta(leche, 2))  # 3200 * 2 = 6400

    pepe.registrar_venta_credito(venta_fiada)
    print(f"Deuda de Pepe después de compra: ${pepe.deuda_total}")

    # 4. Prueba de Abono
    pepe.registrar_abono(3000)
    print(f"Deuda de Pepe después de abono de $3000: ${pepe.deuda_total}")

    # 5. Prueba de Gastos (Polimorfismo)
    recibo_luz = Gasto("Pago Electricidad", 45000, CategoriaGasto.SERVICIOS)

    # Demostración de Polimorfismo
    transacciones = [venta_fiada, recibo_luz]
    print("\n--- Resumen de Movimientos ---")
    for t in transacciones:
        print(f"{t.fecha.strftime('%Y-%m-%d')} | {t.concepto}: ${t.obtener_total()}")


if __name__ == "__main__":
    try:
        ejecutar_pruebas()
    except ValueError as e:
        print(f"Error de validación capturado: {e}")
