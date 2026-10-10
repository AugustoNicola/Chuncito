"""
`make db-backup`: a `pg_dump` of the chosen target into `backups/` (gitignored).

Neon's free plan can only restore within a short window, so these dumps are
the long-term copy. `make db-migrate TARGET=main` runs this first and stops if
it fails; those dumps, and any made by hand, are kept until deleted by hand.
`make backup-timer` runs it against `main` daily with `KEEP=14`, i.e.
`--keep 14`: those dumps are named `-daily-` and only the newest 14 are kept,
so the timer does not fill the disk. Pruning only ever touches `-daily-`
dumps, and only after the new one has been read back.

Uses the direct connection: `pg_dump` needs a real session, which PgBouncer's
transaction pooling does not give. Refuses a `pg_dump` older than the server,
which would fail halfway or produce a dump that cannot be restored, and reads
every dump back with `pg_restore --list` before calling it a backup.
"""
import argparse
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
    parser = argparse.ArgumentParser(description='pg_dump the target into backups/')
    parser.add_argument('--keep', type=int, metavar='N',
                        help='a scheduled dump: keep only the newest N of these')
    args = parser.parse_args()
    if args.keep is not None and args.keep < 1:
        parser.error('--keep must be at least 1')
    settings = get_settings()
    url = settings.direct_url

    pg_dump, pg_restore = shutil.which('pg_dump'), shutil.which('pg_restore')
    if not (pg_dump and pg_restore):
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
    kind = '-daily' if args.keep else ''
    out = out_dir / f'chuncito-{settings.chuncito_target}{kind}-{stamp}.dump'
    # Custom format: compressed, and `pg_restore` can pick tables out of it.
    result = subprocess.run([pg_dump, '--format=custom', '--no-owner', '--no-privileges',
                             f'--file={out}', url])
    if result.returncode != 0:
        out.unlink(missing_ok=True)
        return result.returncode
    # A truncated or corrupt archive is only discovered when it is needed, so
    # read the table of contents now. A bad file is kept, renamed, for a look.
    listing = subprocess.run([pg_restore, '--list', str(out)], capture_output=True, text=True)
    if listing.returncode != 0 or 'TABLE DATA public matches' not in listing.stdout:
        bad = out.with_suffix('.unreadable')
        out.rename(bad)
        print(f'{bad.relative_to(REPO_ROOT)} cannot be read back:\n{listing.stderr}',
              file=sys.stderr)
        return 1
    print(f'{out.relative_to(REPO_ROOT)} ({out.stat().st_size:,} bytes, target: '
          f'{settings.chuncito_target})')
    if args.keep:
        # The UTC stamp sorts by name, oldest first.
        daily = sorted(out_dir.glob(f'chuncito-{settings.chuncito_target}-daily-*.dump'))
        for old in daily[:-args.keep]:
            old.unlink()
            print(f'pruned {old.relative_to(REPO_ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
