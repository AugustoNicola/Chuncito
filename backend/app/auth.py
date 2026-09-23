"""
The PIN gate: one PIN, shared by the whole group.

Entering it once sets a long-lived cookie, so a phone at the table never asks
again. The cookie is an HMAC of the PIN under the server secret rather than a
stored session, so there is no session table, and **changing the PIN signs
everyone out** -- which is the only revocation a shared PIN can have.

It is a lock on the front door of a friends' mahjong log, not bank security:
the point is that the history is not open to whoever finds the URL. Guessing is
slowed by a per-address limit on wrong attempts.
"""
import hashlib
import hmac
import secrets
import time
from collections import defaultdict

from fastapi import HTTPException, Request, Response, status

from .settings import get_settings

COOKIE = 'chuncito_session'
COOKIE_MAX_AGE = 400 * 24 * 3600  # browsers cap cookie lifetimes at about 400 days

MAX_FAILURES = 10
WINDOW_SECONDS = 15 * 60

_process_secret = secrets.token_hex(32)
_failures: dict[str, list[float]] = defaultdict(list)


def _secret() -> str:
    return get_settings().chuncito_secret or _process_secret


def _token(pin: str) -> str:
    return hmac.new(_secret().encode(), f'chuncito-session:{pin}'.encode(),
                    hashlib.sha256).hexdigest()


def configured() -> bool:
    return bool(get_settings().chuncito_pin)


def is_unlocked(request: Request) -> bool:
    pin = get_settings().chuncito_pin
    cookie = request.cookies.get(COOKIE)
    return bool(pin and cookie and hmac.compare_digest(cookie, _token(pin)))


def require_session(request: Request) -> None:
    """Dependency for every route that touches the group's data."""
    if not configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, 'no PIN is configured')
    if not is_unlocked(request):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'enter the PIN')


def _client(request: Request) -> str:
    """
    Who is guessing. Behind Heroku's router every connection comes from the
    router, so the caller is the **last** `X-Forwarded-For` entry: the one the
    router appended. Anything before it is whatever the client sent. Trusting
    that (as uvicorn's `--forwarded-allow-ips '*'` would, taking the first)
    lets a guesser claim a fresh address on every try.
    """
    if get_settings().behind_router:
        forwarded = ','.join(request.headers.getlist('x-forwarded-for'))
        last = forwarded.rsplit(',', 1)[-1].strip()
        if last:
            return last
    return request.client.host if request.client else 'unknown'


def unlock(request: Request, response: Response, pin: str) -> None:
    expected = get_settings().chuncito_pin
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, 'no PIN is configured')

    who = _client(request)
    now = time.monotonic()
    recent = [t for t in _failures[who] if now - t < WINDOW_SECONDS]
    _failures[who] = recent
    if len(recent) >= MAX_FAILURES:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            'too many wrong PINs; try again in a few minutes')

    if not hmac.compare_digest(pin.encode(), expected.encode()):
        recent.append(now)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'wrong PIN')

    _failures.pop(who, None)
    response.set_cookie(
        COOKIE, _token(expected), max_age=COOKIE_MAX_AGE, httponly=True, samesite='lax',
        secure=get_settings().chuncito_secure_cookies, path='/',
    )


def lock(response: Response) -> None:
    response.delete_cookie(COOKIE, path='/')
