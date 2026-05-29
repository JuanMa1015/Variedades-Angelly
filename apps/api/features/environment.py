import os

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.auth.bootstrap import ensure_default_auth_users
from src.infrastructure.database.connection import get_db
from src.infrastructure.database.models import Base
from src.main import app


def before_scenario(context, scenario):
    for key in list(os.environ):
        if key.startswith("AUTH_") or key in ("JWT_SECRET_KEY", "LOGIN_RATE_LIMIT", "APP_ENV"):
            del os.environ[key]
    os.environ["APP_ENV"] = "test"
    os.environ["AUTH_BOOTSTRAP_ENABLED"] = "true"
    os.environ["AUTH_ADMIN_USERNAME"] = "angelly_admin"
    os.environ["AUTH_ADMIN_PASSWORD"] = "cambiame123"
    os.environ["AUTH_SELLER_USERNAME"] = "vendedor1"
    os.environ["AUTH_SELLER_PASSWORD"] = "ventas123"
    os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-with-32-bytes-minimum"
    os.environ["LOGIN_RATE_LIMIT"] = "10000/minute"

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    seed_session = TestingSessionLocal()
    try:
        ensure_default_auth_users(seed_session)
    finally:
        seed_session.close()

    context.client = TestClient(app)
    context.db_session = TestingSessionLocal


def after_scenario(context, scenario):
    app.dependency_overrides.clear()
    if hasattr(context, "db_session"):
        session = context.db_session()
        session.close()
