# Chuncito

A web companion for Riichi Mahjong games: live match tracking, hand scoring, and
match history with per-player stats.

Hand scoring is powered by [Mahjonglog](https://github.com/), a SWI-Prolog
engine, compiled to WebAssembly and running on-device — so scoring works without
a connection and needs no Prolog on the server.

Status: early development. See `docs/ROADMAP.md`.

## Development

```bash
cd frontend
npm install
npm run dev            # dev server
npm test               # contract + unit tests
npm run test:browser   # real-browser smoke test
```

The backend (FastAPI + Postgres) saves matches for the group's history. It
needs the database URLs in a repo-root `.env` (see `backend/app/settings.py`)
and a `CHUNCITO_PIN`:

```bash
make backend-setup     # Python venv
make backend-dev       # API on :8000; the Vite dev server proxies /api to it
make backend-test      # against a throwaway schema on the dev database
```

The app works without the backend; matches wait on the phone until it answers.

## Credits

Tile artwork: [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles) (CC0 1.0).
