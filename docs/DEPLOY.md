# Deploy

One Heroku app, **`chuncito`**, at **<https://chuncito-04cb54b392c2.herokuapp.com/>**, on an **Eco**
dyno in the US region. The suffix is Heroku's: apps made since June 2023 get a
random one, and the bare `chuncito.herokuapp.com` is not available (its "No
such app" page says nothing about whether a name is free). A custom domain
can be added at any time; ACM gives it a certificate on Eco too. It serves the built frontend and the API from one
origin, which the PIN cookie needs. The database is not on Heroku: it is the
Neon project's default branch (`aws-us-east-2`, Ohio; Heroku's US region is
Virginia).

**The host is written into `frontend/index.html`** as the link preview's
`og:image`, which has to be an absolute URL. A custom domain means updating it
there. `robots.txt` still turns every crawler away: previews made by the
sending phone (WhatsApp, iMessage) or by bots that ignore robots (Telegram,
Discord) unfurl; ones from crawlers that obey it (X, LinkedIn) will not.

**Naming:** our code calls the real database's target `main`
(`CHUNCITO_TARGET=main`); Neon's console calls that branch **`production`**,
endpoint `ep-odd-poetry-…`. The `dev` target is Neon's `dev` branch,
`ep-crimson-lake-…`. Only the URLs decide which branch is reached.

**Every push to `main` on GitHub deploys**, through Heroku's GitHub
integration. Committing locally does not; pushing does.

## What happens on a push

1. **Build.** Two buildpacks, in this order:
   - `heroku/nodejs` reads the root `package.json` (Node **22.x**; the local
     Node 18 pin does not apply here, since this is only the build tool) and
     runs `heroku-postbuild`: `npm ci --include=dev` in `frontend/` (Heroku sets
     `NODE_ENV=production`, which would skip Vite and TypeScript), `npm run
     build`, then deletes `frontend/node_modules` so it is not in the slug.
     The scorer's files come straight from `node_modules/swipl-wasm` into
     `assets/`, fingerprinted (`engine.browser.ts`).
   - `heroku/python` reads the root `requirements.txt` (which is just
     `-r backend/requirements.txt`) and `.python-version` (**3.12**, as local).
2. **Release** (`Procfile`): `scripts/check_migrations.py` compares the `main`
   database's Alembic revision with the code's and **fails the release if they
   differ**. It never migrates. A failed release leaves the previous version
   serving.
3. **Web**: `uvicorn app.main:app --workers 1` from `backend/`.

## Changes with a migration

Migrations on `main` are run by hand, backup first, **before** pushing the
code that needs them:

```sh
make db-backup TARGET=main     # needs postgresql-client-18
make db-migrate TARGET=main
make db-check TARGET=main      # what the release phase will say
git push                       # now the release check passes
```

Migrations are therefore written to be additive — the code still serving
while the migration runs is the old code. Pushing first is safe too: the release
phase refuses, and nothing changes until the database catches up.

`main` was first migrated on 2026-09-23, empty; it had no data to back up.

## Config vars

| Var | Value |
|---|---|
| `CHUNCITO_TARGET` | `main` |
| `DATABASE_URL` | Neon `main`, direct (release check) |
| `DATABASE_URL_POOLED` | Neon `main`, pooled (the app) |
| `CHUNCITO_PIN` | the group's PIN, **without** the quotes `.env` has it in |
| `CHUNCITO_SECRET` | random, made once: `python3 -c 'import secrets; print(secrets.token_hex(32))'`. Changing it signs everyone out, like changing the PIN |
| `CHUNCITO_SECURE_COOKIES` | `true` |

Do **not** attach Heroku Postgres: it would claim `DATABASE_URL`.

Not configured, read: Heroku sets `DYNO` on every dyno, and the backend takes
it to mean it is behind Heroku's router (`Settings.behind_router`). Then plain
HTTP is redirected to HTTPS (308, so a PUT stays a PUT — without it the Secure
cookie is never sent back and the PIN seems not to stick), and the wrong-PIN
limit counts the **last** `X-Forwarded-For` entry, the one the router
appended. Without that, every caller would be the router, and ten wrong PINs
from anyone would lock out everyone. `tests/test_router.py`.

## Eco, and what it means here

- **Sleeps after 30 minutes without a request**; the next one waits a few
  seconds while it boots (and Neon may be waking too). The table never notices
  — saves are queued and retried — and during a game each hand's save keeps it
  awake. The first History or Players page after a quiet spell is slow.
- 1,000 dyno hours a month for $5, shared by every Eco app on the account.
  Asleep costs nothing; even never sleeping is 744 h. Running out puts every
  Eco app to sleep until the 1st.
- Restarted daily. The wrong-PIN counter is in memory and resets then; sessions
  survive because `CHUNCITO_SECRET` is set.
- 512 MB, one web dyno. Personal apps only (not under a Heroku Team).

Heroku has been in "sustaining engineering" since February 2026 — maintained,
no new features, no end date announced. Nothing here is Heroku-specific beyond
these files and `DYNO`: moving elsewhere is the same build, the same command,
the same config vars, and a replacement for `behind_router`.

## One-time setup (done 2026-09-23, from the dashboard)

In the dashboard: create `chuncito` (US, personal), confirm the web dyno is
Eco, then **Deploy → GitHub**: connect `AugustoNicola/Chuncito`, enable
automatic deploys from `main` (there is no CI to wait for). With the CLI:

```sh
heroku buildpacks:add -a chuncito heroku/nodejs
heroku buildpacks:add -a chuncito heroku/python
heroku config:set -a chuncito CHUNCITO_TARGET=main CHUNCITO_SECURE_COOKIES=true ...
```

## When something is wrong

- `heroku logs -a chuncito --tail` — build, release and request logs.
- `heroku releases -a chuncito`; `heroku rollback -a chuncito` goes back to the
  previous release (code and config, not the database).
- `curl https://chuncito-04cb54b392c2.herokuapp.com/api/health` answers `{"ok":true}` only
  if the database does too.
