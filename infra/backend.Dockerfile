FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Minimal system packages for psycopg binary compatibility and health tooling.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY apps/api/src ./src
COPY apps/api/alembic ./alembic
COPY apps/api/alembic.ini ./alembic.ini
COPY scripts/release_api.sh ./scripts/release_api.sh

RUN chmod +x ./scripts/release_api.sh     && useradd --system --uid 10001 --no-create-home app     && mkdir -p /app/uploads     && chown -R app:app /app

# El proceso no corre como root: un fallo en la API no da control del contenedor.
USER app

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

ENTRYPOINT ["sh", "./scripts/release_api.sh"]
