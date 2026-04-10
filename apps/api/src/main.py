"""Aplicacion principal FastAPI para Tienda Angelly."""

from __future__ import annotations

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
