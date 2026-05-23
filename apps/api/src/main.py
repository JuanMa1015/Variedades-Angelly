"""Aplicacion principal FastAPI para Tienda Angelly."""

from __future__ import annotations

from fastapi import FastAPI, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import IntegrityError
from pydantic import ValidationError

from src.api.routers.auditorias import router as auditorias_router
from src.api.routers.auth import router as auth_router
from src.api.routers.clientes_cartera_clientes import router as clientes_cartera_clientes_router
from src.api.routers.clientes_cartera_cobros import router as clientes_cartera_cobros_router
from src.api.routers.clientes_cartera_ventas import router as clientes_cartera_ventas_router
from src.api.routers.clientes_tienda_fiado import router as clientes_tienda_fiado_router
from src.api.routers.dashboard import router as dashboard_router
from src.api.routers.fidelizacion_clientes import router as fidelizacion_clientes_router
from src.api.routers.operaciones import router as operaciones_router
from src.api.routers.productos import router as productos_router
from src.api.routers.ventas_fidelizacion import router as ventas_fidelizacion_router

app = FastAPI(title="Tienda Angelly API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_origin_regex=(
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https://[a-z0-9.-]+\.devtunnels\.ms"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Global Exception Handlers ───

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = []
    for error in exc.errors():
        field = " → ".join(str(loc) for loc in error.get("loc", []))
        msg = error.get("msg", "")
        errors.append(f"Campo '{field}': {msg}" if field else msg)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": "Error de validación", "errors": errors},
    )

@app.exception_handler(ValidationError)
async def pydantic_validation_handler(request, exc):
    errors = []
    for error in exc.errors():
        field = " → ".join(str(loc) for loc in error.get("loc", []))
        msg = error.get("msg", "")
        errors.append(f"Campo '{field}': {msg}" if field else msg)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": "Error de validación", "errors": errors},
    )

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request, exc):
    detail = _extract_integrity_detail(str(exc.orig))
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": detail},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    if isinstance(exc, ValueError):
        detail = str(exc)
    else:
        detail = "Ocurrió un error inesperado. Por favor, intenta de nuevo."
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail},
    )

def _extract_integrity_detail(error_text: str) -> str:
    error_str = str(error_text)
    # Check constraint violations
    constraints = {
        "chk_cliente_credito": "El límite de crédito no puede ser negativo.",
        "chk_cliente_identificacion": "La identificación del cliente no puede estar vacía.",
        "chk_producto_precios": "Los precios y stock del producto no pueden ser negativos.",
        "chk_venta_total": "El total de la venta no puede ser negativo.",
        "chk_detalle_venta": "Las cantidades y precios del detalle de venta no pueden ser negativos.",
        "chk_pedido_total": "El total del pedido no puede ser negativo.",
        "chk_factura_total": "El total de la factura no puede ser negativo.",
        "chk_factura_detalle": "Las cantidades y precios del detalle de factura no pueden ser negativos.",
        "chk_gasto_monto": "El monto del gasto no puede ser negativo.",
        "chk_abono_monto": "El monto del abono no puede ser negativo.",
        "chk_cierre_apertura": "El monto de apertura no puede ser negativo.",
        "chk_cierre_cierre": "El monto de cierre no puede ser negativo.",
        "chk_movimiento_cantidad": "La cantidad del movimiento no puede ser negativa.",
        "chk_devolucion_cantidad": "La cantidad de la devolución no puede ser negativa.",
        "chk_devolucion_total": "El total de la devolución no puede ser negativo.",
        "chk_detalle_venta_subtotal": "El subtotal del detalle de venta no puede ser negativo.",
        "chk_factura_detalle_subtotal": "El subtotal del detalle de factura no puede ser negativo.",
        "chk_cliente_identificacion_not_empty": "La identificación del cliente no puede estar vacía.",
        "chk_cliente_nombre_not_empty": "El nombre del cliente no puede estar vacío.",
        "chk_cliente_telefono_not_empty": "El teléfono del cliente no puede estar vacío.",
        "chk_producto_codigo_not_empty": "El código del producto no puede estar vacío.",
        "chk_producto_nombre_not_empty": "El nombre del producto no puede estar vacío.",
        "chk_venta_fecha_not_null": "La fecha de la venta es obligatoria.",
        "chk_pedido_fecha_not_null": "La fecha del pedido es obligatoria.",
        "chk_gasto_fecha_not_null": "La fecha del gasto es obligatoria.",
    }
    for chk, msg in constraints.items():
        if chk in error_str:
            return msg
    # Unique constraint
    if "unique constraint" in error_str or "duplicate key" in error_str:
        return "Ya existe un registro con ese valor único."
    # Foreign key
    if "foreign key constraint" in error_str or "violates foreign key" in error_str:
        return "El registro relacionado no existe o no es válido."
    # Not null
    if "null value in column" in error_str or "violates not-null constraint" in error_str:
        return "Un campo obligatorio está vacío."
    return f"Error de integridad en la base de datos: {error_str[:200]}"

# ─── Routers ───
app.include_router(auth_router)
app.include_router(productos_router)
app.include_router(dashboard_router)
app.include_router(ventas_fidelizacion_router)
app.include_router(clientes_tienda_fiado_router)
app.include_router(fidelizacion_clientes_router)
app.include_router(clientes_cartera_cobros_router)
app.include_router(clientes_cartera_clientes_router)
app.include_router(clientes_cartera_ventas_router)
app.include_router(operaciones_router)
app.include_router(auditorias_router)
