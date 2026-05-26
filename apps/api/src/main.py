"""Aplicacion principal FastAPI para Tienda Angelly."""

from __future__ import annotations

import logging
import os
import re
import time

from fastapi import FastAPI, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "connect-src 'self'; "
            "font-src 'self' data:; "
            "form-action 'self'"
        )
        return response
from sqlalchemy.exc import IntegrityError
from pydantic import ValidationError

from sqlalchemy import text

from src.api.routers.auditorias import router as auditorias_router
from src.api.routers.caja import router as caja_router
from src.api.routers.auth import router as auth_router
from src.api.routers.clientes_cartera_clientes import router as clientes_cartera_clientes_router
from src.api.routers.clientes_cartera_cobros import router as clientes_cartera_cobros_router
from src.api.routers.clientes_cartera_ventas import router as clientes_cartera_ventas_router
from src.api.routers.clientes_tienda_fiado import router as clientes_tienda_fiado_router
from src.api.routers.dashboard import router as dashboard_router
from src.api.routers.fidelizacion_clientes import router as fidelizacion_clientes_router
from src.api.routers.proveedores import router as proveedores_router
from src.api.routers.pedidos_proveedor import router as pedidos_proveedor_router
from src.api.routers.gastos import router as gastos_router
from src.api.routers.facturas_compra import router as facturas_compra_router
from src.api.routers.productos import router as productos_router
from src.api.routers.ventas_fidelizacion import router as ventas_fidelizacion_router
from src.api.routers.superadmin import router as superadmin_router
from src.api.routers.export import router as export_router
from src.api.limiter import limiter
from src.infrastructure.database.connection import get_db

logger = logging.getLogger("tienda_angelly")
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
if not logger.handlers:
    logger.addHandler(_handler)

app = FastAPI(title="Tienda Angelly API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


def _load_cors_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if raw_origins:
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]


def _load_cors_origin_regex() -> str | None:
    raw_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip()
    return raw_regex or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_cors_origins(),
    allow_origin_regex=_load_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request Logging Middleware ───

@app.middleware("http")
async def log_requests(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "%s %s → %s (%dms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# ─── Global Exception Handlers ───

def _cors_response(status_code: int, content: dict, request) -> JSONResponse:
    """Retorna JSONResponse con CORS headers para errores fuera del middleware."""
    resp = JSONResponse(status_code=status_code, content=content)
    origin = request.headers.get("origin", "")
    allowed = _load_cors_origins()
    regex = _load_cors_origin_regex()
    if origin in allowed or (regex and re.search(regex, origin)):
        resp.headers["Access-Control-Allow-Origin"] = origin
    resp.headers["Access-Control-Allow-Credentials"] = "true"
    resp.headers["Access-Control-Allow-Methods"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return _cors_response(
        exc.status_code,
        {"detail": exc.detail},
        request,
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = []
    for error in exc.errors():
        field = " → ".join(str(loc) for loc in error.get("loc", []))
        msg = error.get("msg", "")
        errors.append(f"Campo '{field}': {msg}" if field else msg)
    return _cors_response(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        {"detail": "Error de validación", "errors": errors},
        request,
    )

@app.exception_handler(ValidationError)
async def pydantic_validation_handler(request, exc):
    errors = []
    for error in exc.errors():
        field = " → ".join(str(loc) for loc in error.get("loc", []))
        msg = error.get("msg", "")
        errors.append(f"Campo '{field}': {msg}" if field else msg)
    return _cors_response(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        {"detail": "Error de validación", "errors": errors},
        request,
    )

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request, exc):
    detail = _extract_integrity_detail(str(exc.orig))
    return _cors_response(
        status.HTTP_409_CONFLICT,
        {"detail": detail},
        request,
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    if isinstance(exc, ValueError):
        detail = str(exc)
    else:
        detail = "Ocurrió un error inesperado. Por favor, intenta de nuevo."
    return _cors_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        {"detail": detail},
        request,
    )

def _extract_integrity_detail(error_text: str) -> str:
    error_str = str(error_text)
    # Check constraint violations — nombres exactos de migracion 683d65d3108c
    constraints = {
        "ck_cliente_limite_credito": "El límite de crédito no puede ser negativo.",
        "ck_cliente_deuda_total": "La deuda total no puede ser negativa.",
        "ck_producto_precio_costo": "El precio de costo no puede ser negativo.",
        "ck_producto_precio_venta": "El precio de venta no puede ser negativo.",
        "ck_producto_stock_actual": "El stock actual no puede ser negativo.",
        "ck_producto_stock_minimo": "El stock mínimo no puede ser negativo.",
        "ck_venta_total": "El total de la venta no puede ser negativo.",
        "ck_venta_saldo_pendiente": "El saldo pendiente no puede ser negativo.",
        "ck_detalle_venta_cantidad": "La cantidad del detalle debe ser mayor a cero.",
        "ck_detalle_venta_precio_unitario": "El precio unitario del detalle no puede ser negativo.",
        "ck_detalle_venta_subtotal": "El subtotal del detalle no puede ser negativo.",
        "ck_pedido_monto_estimado": "El monto estimado del pedido no puede ser negativo.",
        "ck_factura_subtotal": "El subtotal de la factura no puede ser negativo.",
        "ck_factura_total_iva": "El IVA de la factura no puede ser negativo.",
        "ck_factura_total": "El total de la factura no puede ser negativo.",
        "ck_factura_detalle_cantidad": "La cantidad del detalle de factura debe ser mayor a cero.",
        "ck_factura_detalle_precio_unitario": "El precio unitario del detalle de factura no puede ser negativo.",
        "ck_factura_detalle_precio_total": "El precio total del detalle de factura no puede ser negativo.",
        "ck_gasto_monto": "El monto del gasto debe ser mayor a cero.",
        "ck_abono_monto": "El monto del abono debe ser mayor a cero.",
        "ck_abono_saldo_cliente": "El saldo del cliente no puede ser negativo.",
        "ck_caja_monto_inicial": "El monto de apertura no puede ser negativo.",
        "ck_caja_monto_ventas_efectivo": "El monto de ventas en efectivo no puede ser negativo.",
        "ck_caja_monto_ventas_transferencia": "El monto de ventas por transferencia no puede ser negativo.",
        "ck_caja_monto_gastos": "El monto de gastos no puede ser negativo.",
        "ck_movimiento_cantidad": "La cantidad del movimiento debe ser mayor a cero.",
        "ck_devolucion_cantidad": "La cantidad de la devolución debe ser mayor a cero.",
        "ck_devolucion_monto_devuelto": "El monto devuelto no puede ser negativo.",
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

# ─── Health Check ───

@app.get("/health")
def health_check():
    db_ok = False
    try:
        db = next(get_db())
        db.execute(text("SELECT 1"))
        db.close()
        db_ok = True
    except Exception as e:
        logger.warning("Health check — DB error: %s", e)
    return {
        "status": "ok",
        "database": "connected" if db_ok else "unavailable",
    }


# ─── Routers ───
app.include_router(auth_router)
app.include_router(productos_router)
app.include_router(dashboard_router)
app.include_router(superadmin_router)
app.include_router(ventas_fidelizacion_router)
app.include_router(clientes_tienda_fiado_router)
app.include_router(fidelizacion_clientes_router)
app.include_router(clientes_cartera_cobros_router)
app.include_router(clientes_cartera_clientes_router)
app.include_router(clientes_cartera_ventas_router)
app.include_router(proveedores_router)
app.include_router(pedidos_proveedor_router)
app.include_router(gastos_router)
app.include_router(facturas_compra_router)
app.include_router(auditorias_router)
app.include_router(caja_router)
app.include_router(export_router)
