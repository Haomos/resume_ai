"""Alembic migration environment.

Notes
-----
* Pulls the DB URL from ``app.config.get_config()`` so the migration tool
  always tracks the same database the running app uses (driven by
  ``DB_URL`` in ``.env``, falling back to ``sqlite+aiosqlite:///data/...``).
* Strips the ``+aiosqlite`` driver suffix because Alembic itself runs
  synchronously — the async driver is only needed by FastAPI request
  handlers.
* Imports ``app.models`` (which re-exports every ORM class) so
  ``Base.metadata`` knows about every table; without this,
  ``--autogenerate`` would emit empty diffs.
* SQLite-specific: enables ``render_as_batch=True`` on the migration
  context. SQLite has no real ``ALTER TABLE``, so Alembic emulates it by
  recreating the table (the "batch" mode). Required for any future
  migration that adds / drops / alters columns.
"""

from logging.config import fileConfig
from pathlib import Path
import sys

from sqlalchemy import engine_from_config, pool

from alembic import context

# Make the ``app`` package importable when alembic is run from ``backend/``.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.config import get_config  # noqa: E402
from app.database import Base  # noqa: E402
import app.models  # noqa: E402, F401  — registers every model on Base.metadata


# Alembic Config object, providing access to the values within alembic.ini.
config = context.config

# Override sqlalchemy.url with whatever the app currently uses (env / .env).
_app_cfg = get_config()
_sync_url = _app_cfg.database.url.replace("+aiosqlite", "")
config.set_main_option("sqlalchemy.url", _sync_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL without connecting to the DB (``alembic upgrade --sql``)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=connection.dialect.name == "sqlite",
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
