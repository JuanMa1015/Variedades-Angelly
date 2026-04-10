from __future__ import annotations

import types

from src.infrastructure.database import apply_migration as migration_module


def test_is_truthy_variants() -> None:
    assert migration_module._is_truthy("1") is True
    assert migration_module._is_truthy("true") is True
    assert migration_module._is_truthy("Yes") is True
    assert migration_module._is_truthy("si") is True
    assert migration_module._is_truthy("0") is False
    assert migration_module._is_truthy("") is False
    assert migration_module._is_truthy(None) is False


def test_main_blocks_production_without_allow(monkeypatch) -> None:
    calls: list[str] = []

    def fake_apply() -> bool:
        calls.append("apply")
        return True

    monkeypatch.setattr(migration_module, "apply_migration", fake_apply)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("ALLOW_SCHEMA_MIGRATION", raising=False)
    monkeypatch.delenv("RUN_DB_SEED", raising=False)

    exit_code = migration_module.main()

    assert exit_code == 2
    assert calls == []


def test_main_runs_seed_when_flag_enabled(monkeypatch) -> None:
    calls: list[str] = []

    def fake_apply() -> bool:
        calls.append("apply")
        return True

    def fake_seed() -> None:
        calls.append("seed")

    monkeypatch.setattr(migration_module, "apply_migration", fake_apply)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("RUN_DB_SEED", "true")
    monkeypatch.setenv("ALLOW_SCHEMA_MIGRATION", "false")

    import sys

    sys.modules["src.infrastructure.database.seed_db"] = types.SimpleNamespace(seed_db=fake_seed)

    exit_code = migration_module.main()

    assert exit_code == 0
    assert calls == ["apply", "seed"]


def test_migration_version_metadata_helpers_roundtrip() -> None:
    from sqlalchemy import create_engine

    engine = create_engine("sqlite+pysqlite:///:memory:")

    with engine.connect() as conn:
        migration_module._ensure_migrations_table(conn)

        assert migration_module._is_migration_applied(conn, "v-test-1") is False

        migration_module._mark_migration_applied(conn, "v-test-1")
        assert migration_module._is_migration_applied(conn, "v-test-1") is True

        migration_module._mark_migration_applied(conn, "v-test-1")
        assert migration_module._is_migration_applied(conn, "v-test-1") is True
