# Variedades-Angelly - Sistema de Gestión Financiera y Ventas

Juan Manuel Londoño González
Gilar Valentina Castaño Uran 
Danilo Tangarife Bustamante

Este proyecto es una solución integral para la digitalización de tiendas de barrio, enfocado en resolver el problema del control de "fiados", inventarios y utilidades reales. Desarrollado bajo principios de **Arquitectura Limpia** y **POO Avanzada**.

## 🚀 Objetivo de la Entrega
Implementar la capa de dominio del sistema utilizando Python 3.11+, aplicando conceptos avanzados como encapsulamiento, herencia, polimorfismo y validaciones robustas.

## 🛠️ Stack Tecnológico
- **Lenguaje:** Python 3.11+
- **Backend:** FastAPI (Próxima fase)
- **Frontend:** React + Vite (Próxima fase)
- **Herramientas de Calidad:** Black (PEP 8), Type Hints.

## 📂 Estructura del Dominio (`src/domain/`)
La lógica de negocio está organizada de la siguiente manera:
- **`usuario.py`**: Gestión de roles (Admin/Trabajador) con atributos inmutables.
- **`producto.py`**: Control de inventario y congelación de precios en ventas.
- **`cliente.py`**: Gestión de deudas y abonos (Cálculo dinámico de saldo).
- **`transaccion.py`**: Clase abstracta y polimorfismo para Ventas y Gastos.
- **`enums.py`**: Tipos seguros para evitar errores de integridad.

## 🧠 Conceptos POO Aplicados
1. **Encapsulamiento:** Uso de atributos privados (`_atributo`) y `@property` para validar datos (ej: impedir precios negativos o emails inválidos).
2. **Abstracción:** Implementación de la clase `Transaccion(ABC)` para estandarizar movimientos financieros.
3. **Polimorfismo:** Procesamiento uniforme de distintas transacciones mediante el método `obtener_total()`.
4. **Herencia:** Especialización de usuarios y tipos de transacciones.

## ⚙️ Instalación y Pruebas
1. Clonar el repositorio.
2. Crear entorno virtual: `python -m venv venv`.
3. Activar entorno: `.\venv\Scripts\Activate.ps1` (Windows).
4. Instalar dependencias: `pip install -r requirements.txt`.
5. Ejecutar test de dominio:
   ```powershell
   $env:PYTHONPATH = "."
   python test_dominio.py
