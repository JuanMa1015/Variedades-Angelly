# Informe de Testing - Entrega 2

**Proyecto:** Variedades Angelly (Tienda de Abarrotes)  
**Fecha:** 9 de marzo de 2026

## 1) Resumen de cobertura

Ejecucion validada con:

```bash
pytest --cov=src --cov-report=term-missing --cov-report=html
```

Resultado general:

- Cobertura total: **95%**
- Tests unitarios ejecutados: **23**
- Estado: **23 passed, 0 failed**

Detalle por modulo de dominio:

- `src/domain/cliente.py`: 93%
- `src/domain/enums.py`: 100%
- `src/domain/producto.py`: 90%
- `src/domain/transaccion.py`: 96%
- `src/domain/usuario.py`: 97%

Adicionalmente, pruebas BDD (Behave):

- Features: **1 passed**
- Scenarios: **3 passed**
- Steps: **12 passed**

## 2) Instrucciones exactas para correr los tests (profesor)

Ejecutar desde la raiz del proyecto `Variedades_Angelly` en **PowerShell**:

1. Activar entorno virtual.

```powershell
& ".\.venv\Scripts\Activate.ps1"
```

2. Ejecutar Pytest con cobertura (recomendado desde `backend/` para respetar imports `src.*`).

```powershell
Set-Location backend
& "../.venv/Scripts/python.exe" -m pytest --cov=src --cov-report=term-missing --cov-report=html
```

3. Volver a la raiz y ejecutar Behave.

```powershell
Set-Location ..
& ".\.venv\Scripts\python.exe" -m behave
```

Notas tecnicas:

- Se agrego `behave.ini` en la raiz para que Behave encuentre automaticamente `backend/features` y `backend/features/steps`.
- `backend/features/environment.py` inyecta `backend` en `sys.path` al cargar el modulo, evitando `ImportError: No module named 'src'`.
- Reporte HTML de cobertura generado en `backend/htmlcov/index.html`.

## 3) Justificacion del umbral minimo (80%) y superacion

Se toma **80%** como umbral minimo porque es una referencia ampliamente aceptada en QA para garantizar una base solida de verificacion sin caer en sobrecostos de mantenimiento por cubrir lineas de bajo valor.

En esta entrega se supera ese umbral con **95%** gracias a:

- Cobertura de flujos felices y de error en entidades clave (`Usuario`, `Producto`, `Cliente`, `Transaccion`).
- Casos de borde explicitamente probados (venta sin items, gasto en cero, limites de credito y abonos invalidos).
- Validacion BDD de reglas de negocio de fiados con `Scenario Outline` y multiples ejemplos.

## 4) Alcance de la E2

Las pruebas implementadas son **puramente de dominio** sobre `backend/src/domain`. No se agrego codigo de conexion a PostgreSQL/Neon en esta etapa.
