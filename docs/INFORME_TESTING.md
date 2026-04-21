# Informe de Testing

**Proyecto:** Variedades-Angelly  
**Estructura actual:** monorepo de producción con `apps/api`, `apps/web`, `infra`, `docs` y `scripts`

## 1) Resumen

La validación de pruebas del backend se ejecuta desde [apps/api](../apps/api) y la validación del frontend desde [apps/web](../apps/web).

Validaciones que ya están disponibles en el repo:

- Backend unit tests y contratos con `pytest`
- Escenarios BDD con `behave`
- Lint, tests y build del frontend con Vite/Vitest/ESLint
- Verificación de Docker Compose desde [infra/docker-compose.yml](../infra/docker-compose.yml)

Resultados verificados recientemente:

- Backend: `60 passed`
- Frontend tests: `6 passed`
- Frontend lint: sin errores
- Frontend build: exitoso
- Docker Compose: configuración válida con `docker compose -f infra/docker-compose.yml config`

## 2) Cómo ejecutar los tests

### Backend

```powershell
Set-Location apps/api
& .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest -q
python -m behave
```

### Frontend

```powershell
Set-Location apps/web
npm ci
npm run lint
npm run test
npm run build
```

### Docker

```powershell
docker compose -f infra/docker-compose.yml config
docker compose -f infra/docker-compose.yml up --build
```

## 3) Ubicación de pruebas y soporte

- Tests backend: [apps/api/tests](../apps/api/tests)
- Features BDD: [apps/api/features](../apps/api/features)
- Tests frontend: [apps/web/src/pages/__tests__](../apps/web/src/pages/__tests__)
- Tests de cartera por secciones: [apps/web/src/pages/cartera/__tests__](../apps/web/src/pages/cartera/__tests__)
- Script auxiliar: [scripts/check_tests.sh](../scripts/check_tests.sh)

## 4) Notas operativas

- No usar [backend](../backend) ni [frontend](../frontend) como roots de ejecución; solo quedan como carpetas legacy/artefactos locales.
- Las variables de entorno canónicas están en [`.env.example`](../.env.example).
- Los `.env` reales no deben versionarse.

## 5) Estado actual de calidad

- El backend y el frontend ya fueron validados en la nueva estructura.
- La referencia histórica de cobertura sigue siendo útil, pero la ejecución real hoy debe hacerse con las rutas nuevas del monorepo.
- El estado actual de CI local es sano: backend, frontend y Docker Compose pasan en la estructura migrada.
