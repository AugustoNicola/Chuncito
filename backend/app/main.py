"""
The API. Run with `uvicorn app.main:app` from `backend/`.

| route | what |
|---|---|
| `GET  /api/health`          | liveness, and whether the database answers |
| `GET  /api/session`         | is this browser unlocked? is a PIN configured? |
| `POST /api/session`         | `{pin}` -> sets the session cookie |
| `DELETE /api/session`       | forget the cookie |
| `GET  /api/players`         | everyone registered, by name |
| `POST /api/players`         | `{displayName}` -> the new player; 409 if the name is taken |
| `PATCH /api/players/{id}`   | `{displayName}` -> renamed; 409 if the name is taken |
| `GET  /api/matches`         | summaries, newest first; filters below |
| `GET  /api/matches/{id}`    | `{revision, rows, players}` -- `rows` is `MatchRows` |
| `PUT  /api/matches/{id}`    | `{baseRevision, rows}` -> `{revision}`; 409 if stale |
| `DELETE /api/matches/{id}`  | a match thrown away at the table |
| `GET  /anything/else`       | the built frontend; `index.html` for any route |

Everything under `/api/players` and `/api/matches` needs the PIN cookie.

`GET /api/matches` narrows with any of `status`, `q` (the match's name or
anyone seated), `player` (repeatable: all of them sat), `min_level` (a rank,
`models.LEVEL_RANKS`), `yaku` (an engine atom) and `players` (3 or 4).

Nothing here is meant to be found: every response says `noindex`, and
`/robots.txt` turns crawlers away (the frontend serves one too).
"""
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from . import auth, store
from .db import get_engine
from .settings import get_settings
from .schemas import (
    MatchSummary, MatchWithRevision, PinIn, PlayerName, PlayerOut, PutMatch, Saved,
    SessionState,
)

app = FastAPI(title='Chuncito', docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def no_index(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Robots-Tag'] = 'noindex, nofollow'
    return response


@app.get('/robots.txt', response_class=PlainTextResponse)
def robots() -> str:
    return 'User-agent: *\nDisallow: /\n'


@app.get('/api/health')
def health() -> dict:
    with get_engine().connect() as conn:
        conn.execute(text('select 1'))
    return {'ok': True}


@app.get('/api/session', response_model=SessionState)
def session_state(request: Request) -> SessionState:
    return SessionState(unlocked=auth.is_unlocked(request), configured=auth.configured())


@app.post('/api/session', status_code=status.HTTP_204_NO_CONTENT)
def open_session(body: PinIn, request: Request, response: Response) -> None:
    auth.unlock(request, response, body.pin)


@app.delete('/api/session', status_code=status.HTTP_204_NO_CONTENT)
def close_session(response: Response) -> None:
    auth.lock(response)


gated = [Depends(auth.require_session)]


@app.get('/api/players', response_model=list[PlayerOut], response_model_by_alias=True,
         dependencies=gated)
def list_players() -> list[PlayerOut]:
    with get_engine().connect() as conn:
        return store.list_players(conn)


def _exists(taken: store.PlayerExists) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={
        'detail': str(taken), 'existing': taken.existing.model_dump(by_alias=True),
    })


@app.post('/api/players', response_model=PlayerOut, response_model_by_alias=True,
          status_code=status.HTTP_201_CREATED, dependencies=gated)
def create_player(body: PlayerName):
    try:
        with get_engine().begin() as conn:
            return store.create_player(conn, body.display_name)
    except store.PlayerExists as taken:
        return _exists(taken)


@app.patch('/api/players/{player_id}', response_model=PlayerOut, response_model_by_alias=True,
           dependencies=gated)
def rename_player(player_id: str, body: PlayerName):
    try:
        with get_engine().begin() as conn:
            return store.rename_player(conn, player_id, body.display_name)
    except store.PlayerExists as taken:
        return _exists(taken)
    except store.NoSuchPlayer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'no such player') from None


@app.get('/api/matches', response_model=list[MatchSummary], response_model_by_alias=True,
         dependencies=gated)
def list_matches(include_test: bool = False, status: str | None = None,
                 q: str | None = None, player: Annotated[list[str], Query()] = [],
                 min_level: Annotated[int | None, Query(ge=0)] = None,
                 yaku: str | None = None,
                 players: Annotated[int | None, Query(ge=3, le=4)] = None) -> list[MatchSummary]:
    with get_engine().connect() as conn:
        return store.list_matches(conn, include_test, status, text=q, player_ids=player,
                                  min_level_rank=min_level, yaku=yaku, players=players)


@app.get('/api/matches/{match_id}', response_model=MatchWithRevision,
         response_model_by_alias=True, dependencies=gated)
def get_match(match_id: str) -> MatchWithRevision:
    with get_engine().connect() as conn:
        found = store.load_match(conn, match_id)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'no such match')
    revision, rows, players = found
    return MatchWithRevision(revision=revision, rows=rows, players=players)


@app.put('/api/matches/{match_id}', response_model=Saved, response_model_by_alias=True,
         dependencies=gated)
def put_match(match_id: str, body: PutMatch):
    if body.rows.match.id != match_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'the id in the path and body differ')
    try:
        with get_engine().begin() as conn:
            revision = store.save_match(conn, body.rows, body.base_revision)
    except store.StaleWrite as stale:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={
            'detail': 'this match was changed from another device', 'revision': stale.revision,
        })
    except store.UnknownPlayer as unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f'unknown player: {unknown}') from None
    except (store.DuplicateId, IntegrityError):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            'a hand in this match already belongs to another match')
    return Saved(revision=revision)


@app.delete('/api/matches/{match_id}', status_code=status.HTTP_204_NO_CONTENT,
            dependencies=gated)
def delete_match(match_id: str) -> None:
    # Idempotent: deleting what is already gone is what the phone wanted anyway.
    with get_engine().begin() as conn:
        store.delete_match(conn, match_id)


@app.get('/{path:path}', include_in_schema=False)
def frontend(path: str) -> FileResponse:
    """
    The built app. The frontend has real routes (`/players`, `/match`, ...), so
    a path that is not a file gets `index.html` and the router takes it from
    there -- a reload or a shared link must not 404. Declared last, so every
    API route wins.

    Except: an unknown `/api/...` stays a 404 rather than turning into a page,
    and so does a missing *file* (anything with an extension), since a stale
    script tag handed HTML fails far more confusingly than a 404.
    """
    dist = get_settings().chuncito_frontend_dist.resolve()
    if path == 'api' or path.startswith('api/') or not (dist / 'index.html').is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'not found')
    wanted = (dist / path).resolve()
    if path and wanted.is_file() and wanted.is_relative_to(dist):
        # Vite fingerprints everything under assets/, so it never changes.
        immutable = wanted.is_relative_to(dist / 'assets')
        return FileResponse(wanted, headers={
            'Cache-Control': 'public, max-age=31536000, immutable' if immutable else 'no-cache',
        })
    if '.' in path.rsplit('/', 1)[-1]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'not found')
    return FileResponse(dist / 'index.html', headers={'Cache-Control': 'no-cache'})
