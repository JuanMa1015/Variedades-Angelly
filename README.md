# Variedades-Angelly - Sistema de Gestión Financiera y Ventas

Sistema desarrollado para la gestión de inventarios, control de ventas (contado y crédito) y seguimiento de gastos para pequeños negocios.

## 🚀 Objetivo del Proyecto
Digitalizar el "libro de cuentas" tradicional, permitiendo un control riguroso sobre los saldos de clientes ("fiado"), la utilidad real del negocio y el stock de productos.

## 🛠️ Stack Tecnológico
- **Backend:** Python 3.10+ con FastAPI.
- **Frontend:** React.js (Vite).
- **Lógica de Dominio:** Programación Orientada a Objetos (POO) avanzada.

## 📂 Estructura del Proyecto (Capa de Dominio)
El corazón del sistema se encuentra en `backend/src/domain/`, siguiendo principios de arquitectura limpia:
- `usuario.py`: Gestión de Admin y Trabajadores.
- `cliente.py`: Gestión de deudores y límites de crédito.
- `producto.py`: Control de inventario y precios.
- `transaccion.py`: Lógica de ventas y abonos (Clases abstractas).

## ⚙️ Instalación y Ejecución
1. Clonar el repositorio.
2. Crear entorno virtual: `python -m venv venv`.
3. Activar entorno: `source venv/bin/activate` (Linux/Mac) o `venv\Scripts\activate` (Windows).
4. Instalar dependencias: `pip install -r requirements.txt`.
