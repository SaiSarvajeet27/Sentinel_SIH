"""Authentication and authorisation boundary.

Every API request carries an authenticated identity. There is no demo mode
and no bypass, because the project's central claim is that irreversible
actions require a named human — and a convenience switch that skips the
name would make that claim false whenever somebody forgot to flip it.

The identity comes from a signed token. The role comes from inside that
token, never from the request body, so a client cannot promote itself by
asking.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from app import config

_passwords = CryptContext(schemes=["bcrypt"], deprecated="auto")


@dataclass(frozen=True)
class Principal:
    id: str
    name: str
    role: str


def password_hash(password: str) -> str:
    return _passwords.hash(password)


def password_matches(password: str, hashed: str) -> bool:
    return _passwords.verify(password, hashed)


def create_access_token(principal: Principal) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=config.ACCESS_TOKEN_MINUTES)
    return jwt.encode({"sub": principal.id, "name": principal.name,
                       "role": principal.role, "exp": expires},
                      config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> Principal:
    try:
        payload = jwt.decode(token, config.JWT_SECRET_KEY,
                             algorithms=[config.JWT_ALGORITHM])
        user_id, name, role = payload.get("sub"), payload.get("name"), payload.get("role")
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "invalid or expired access token") from exc
    if not user_id or not name or role not in config.ROLE_PERMISSIONS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid access token")
    return Principal(str(user_id), str(name), str(role))


def request_principal(request: Request) -> Principal:
    principal = getattr(request.state, "principal", None)
    if not isinstance(principal, Principal):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "authentication required")
    return principal


def require_permission(principal: Principal, permission: str) -> None:
    if not config.ROLE_PERMISSIONS.get(principal.role, {}).get(permission, False):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"role '{principal.role}' cannot {permission}")

