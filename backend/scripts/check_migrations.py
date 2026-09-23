"""
Heroku's release phase: refuse to release code the database is not migrated for.

It does **not** migrate. Migrating `main` is done by hand (`make db-backup`,
then `make db-migrate TARGET=main`), so that a backup always comes first;
applying it on every deploy would run a migration against the real matches
with nothing to go back to. This only makes a push that needs one fail loudly,
before the new code serves anyone, instead of failing on the first save.

So the order for a change with a migration is: migrate, then push.

Uses the direct connection, like Alembic.
"""
import sys

from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection

from app.db import make_engine
from app.settings import REPO_ROOT, get_settings

SCRIPTS = ScriptDirectory(str(REPO_ROOT / 'backend' / 'migrations'))


def revisions(conn: Connection) -> tuple[set[str], set[str]]:
    """(what the database is at, what the code expects)."""
    return set(MigrationContext.configure(conn).get_current_heads()), set(SCRIPTS.get_heads())


def main() -> int:
    settings = get_settings()
    engine = make_engine(settings.direct_url)
    try:
        with engine.connect() as conn:
            current, expected = revisions(conn)
    finally:
        engine.dispose()
    if current != expected:
        print(f'the {settings.chuncito_target} database is at {sorted(current) or "nothing"}, '
              f'this code expects {sorted(expected)}. Back it up and migrate it first: '
              f'make db-backup TARGET={settings.chuncito_target} && '
              f'make db-migrate TARGET={settings.chuncito_target}', file=sys.stderr)
        return 1
    print(f'the {settings.chuncito_target} database is at {sorted(current)}, as expected')
    return 0


if __name__ == '__main__':
    sys.exit(main())
