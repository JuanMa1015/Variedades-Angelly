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

RUN chmod +x ./scripts/release_api.sh

EXPOSE 8000

ENTRYPOINT ["sh", "./scripts/release_api.sh"]
