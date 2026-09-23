"""
`make db-backup`: a `pg_dump` of the chosen target into `backups/` (gitignored).

Neon's free plan can only restore within a short window, so these dumps are
the long-term copy. Run before every migration of `main` that holds real
matches (by hand: `make db-migrate` does not do it for you), and whenever else
you like; the whole database is a few MB.

Uses the direct connection: `pg_dump` needs a real session, which PgBouncer's
transaction pooling does not give. Refuses a `pg_dump` older than the server,
which would fail halfway or produce a dump that cannot be restored.
"""
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime

import psycopg

from app.settings import REPO_ROOT, get_settings


def major(version_text: str) -> int:
    match = re.search(r'(\d+)', version_text)
    return int(match.group(1)) if match else 0


def main() -> int:
    settings = get_settings()
    url = settings.direct_url

    pg_dump = shutil.which('pg_dump')
    if not pg_dump:
        print('pg_dump is not installed. For Postgres 18: sudo apt install postgresql-client-18 '
              '(from the PostgreSQL apt repository, apt.postgresql.org).', file=sys.stderr)
        return 1

    with psycopg.connect(url, prepare_threshold=None) as conn:
        server = conn.execute('show server_version').fetchone()[0]
    client = subprocess.run([pg_dump, '--version'], capture_output=True, text=True).stdout
    if major(client) < major(server):
        print(f'pg_dump is {client.strip()}, older than the server ({server}); '
              f'install postgresql-client-{major(server)}.', file=sys.stderr)
        return 1

    out_dir = REPO_ROOT / 'backups'
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')
    out = out_dir / f'chuncito-{settings.chuncito_target}-{stamp}.dump'
    # Custom format: compressed, and `pg_restore` can pick tables out of it.
    result = subprocess.run([pg_dump, '--format=custom', '--no-owner', '--no-privileges',
                             f'--file={out}', url])
    if result.returncode != 0:
        out.unlink(missing_ok=True)
        return result.returncode
    print(f'{out.relative_to(REPO_ROOT)} ({out.stat().st_size:,} bytes, target: '
          f'{settings.chuncito_target})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
