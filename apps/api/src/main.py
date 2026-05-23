"""Aplicacion principal FastAPI para Tienda Angelly."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from src.api.routers.superadmin import router as superadmin_router

app = FastAPI(title="Tienda Angelly API", version="0.1.0")


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
app.include_router(operaciones_router)
app.include_router(auditorias_router)
