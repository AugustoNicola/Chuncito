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

## Credits

Tile artwork: [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles) (CC0 1.0).
