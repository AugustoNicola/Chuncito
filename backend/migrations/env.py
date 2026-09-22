"""
Alembic environment.

Normally connects to the chosen target's direct URL. The tests hand it a
connection of their own instead (`config.attributes['connection']`), already
pointed at a throwaway schema, so the migration under test is the real one.
"""
from logging.config import fileConfig

from alembic import context

from app.db import make_engine
from app.models import metadata
from app.settings import get_settings

config = context.config
if config.config_file_name is not None and not config.attributes.get('connection'):
    fileConfig(config.config_file_name)


def run(connection) -> None:
    context.configure(connection=connection, target_metadata=metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


connection = config.attributes.get('connection')
if connection is not None:
    run(connection)
else:
    settings = get_settings()
    print(f'-- migrating target: {settings.chuncito_target}')
    engine = make_engine(settings.direct_url)
    with engine.connect() as conn:
        run(conn)
    engine.dispose()
