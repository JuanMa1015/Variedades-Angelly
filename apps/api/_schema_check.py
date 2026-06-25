import sys; sys.path.insert(0,'.')
from src.infrastructure.database.connection import engine
from sqlalchemy import inspect

insp = inspect(engine)
cols = insp.get_columns('facturas_compra')
for c in cols:
    print(f'{c["name"]:25s} {str(c["type"]):20s} nullable={c["nullable"]} default={c["default"]}')
print()
cols2 = insp.get_columns('factura_compra_detalles')
for c in cols2:
    print(f'{c["name"]:25s} {str(c["type"]):20s} nullable={c["nullable"]} default={c["default"]}')
