---
name: verify
description: Use when the user asks to verify, validate, run tests, or check that a change is ready to merge or deploy ("verifica", "corre los tests", "pasa los tests", "validate los cambios"). Runs the full verification suite - backend pytest + behave and frontend lint/test/build - exactly as CI does.
---

# Verify

Ejecuta la verificación completa del monorepo, replicando lo que corre la CI
(`.github/workflows/backend-ci.yml`).

## Uso

Ejecuta **siempre** los cuatro pasos. No declares éxito si alguno falla.

## Paso 1 — Backend: pytest

Desde `apps/api`, usando el venv local:

```powershell
Set-Location apps\api
..\..\apps\api\.venv\Scripts\python.exe -m pytest -q
```

Equivalente desde la raíz del monorepo:

```powershell
apps\api\.venv\Scripts\python.exe -m pytest apps\api\tests -q
```

Notas:
- `apps/api/pytest.ini` define `testpaths = tests` y `pythonpath = .`, así que
  **debes** correr desde `apps/api` para que los imports `src.*` resuelvan.
- Hay un test de contrato de Alembic (`tests/test_alembic_drift.py`) que valida
  que los modelos ORM y las migraciones no diverjan. Si falla, casi siempre
  falta una migración: revisa `memory.md` → "Migraciones".
- Usa el venv. No inventes otro intérprete ni `pip install` global.

## Paso 2 — Backend: BDD (behave)

```powershell
Set-Location apps\api
..\..\apps\api\.venv\Scripts\python.exe -m behave features/
```

Los escenarios viven en `apps/api/features/*.feature` (`auth`, `cartera`,
`clientes`, `inventario`, `productos`, `ventas`) con `features/environment.py` y
`features/steps/`.

## Paso 3 — Frontend: lint + test + build

```powershell
Set-Location apps\web
npm run lint
npm run test
npm run build
```

## Reporte

Devuelve un resumen corto con el resultado de cada paso. Si algo falla, incluye
el nombre del test/archivo y el mensaje de error relevante, sin volcar el log
completo.

## Antes de proponer un PR

Esta skill debe pasar **completa** antes de pushear a una rama. Si un paso falla,
arregla la causa y vuelve a correr; no digas "listo para producción" con pasos
en rojo.
