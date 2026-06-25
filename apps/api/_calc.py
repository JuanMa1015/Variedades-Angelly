import sys; sys.path.insert(0,'.')
from src.infrastructure.database.connection import SessionLocal
from src.infrastructure.database.models import FacturaCompraDetalleModel
from sqlalchemy import select

db = SessionLocal()
detalles = db.execute(
    select(FacturaCompraDetalleModel).where(FacturaCompraDetalleModel.factura_id == 8)
).scalars().all()

IVA = 0.19
t_base = 0
t_iva = 0

for d in detalles:
    base = d.cantidad * d.precio_unitario
    iva = round(base * IVA, 2) if d.aplica_iva else 0
    total = base + iva
    t_base += base
    t_iva += iva
    print(f'{d.nombre_producto:30s} x{d.cantidad:<3d} @ {d.precio_unitario:>7} = base {base:>8}  IVA {iva:>8}  total {total:>8}')

print(f'\nSubtotal: {t_base}')
print(f'     IVA: {round(t_iva, 2)}')
print(f'   Total: {t_base + round(t_iva, 2)}')
print(f'\nTus valores: Subtotal=125,057  IVA=23,761  Total=148,818')
print(f'   Dif Sub: {125057 - t_base}')
print(f'   Dif IVA: {23761 - round(t_iva, 2)}')

# Check if maybe IVA is calculated differently (precio_unitario * iva_rate per unit, not per base)
t_iva2 = 0
for d in detalles:
    iva2 = round(d.precio_unitario * IVA, 2) * d.cantidad if d.aplica_iva else 0
    t_iva2 += iva2
print(f'\nIVA si se calcula por unidad: {round(t_iva2, 2)}')

db.close()
