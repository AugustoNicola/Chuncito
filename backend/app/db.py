"""
The engine, set up for Neon.

- **Prepared statements off.** The app connects through PgBouncer in
  transaction mode, where consecutive statements can land on different server
  connections; a statement prepared on one does not exist on the next.
  psycopg prepares automatically after a few executions, so it is disabled.
- **`pool_pre_ping`.** Neon suspends the compute after a few idle minutes and
  its connections go with it. Without a ping, the first request after a quiet
  spell would be handed a dead connection and fail.
- TLS and channel binding come from the URL's own `sslmode` and
  `channel_binding`, which psycopg (libpq) understands as given.
"""
from functools import lru_cache

from sqlalchemy import Engine, create_engine

from .settings import get_settings, sqlalchemy_url


def make_engine(url: str, **kwargs) -> Engine:
    connect_args = {'prepare_threshold': None, **kwargs.pop('connect_args', {})}
    return create_engine(
        sqlalchemy_url(url),
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=2,
        connect_args=connect_args,
        **kwargs,
    )


@lru_cache
def get_engine() -> Engine:
    return make_engine(get_settings().app_url)
