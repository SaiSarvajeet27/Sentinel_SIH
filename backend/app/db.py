"""Database session and a tiny in-process event bus.

The bus is what drives the WebSocket. Publishing is fire-and-forget so the
pipeline never blocks on a slow browser.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

from app import config
from app.models import Base

log = logging.getLogger(__name__)

engine = create_engine(
    config.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """Create a fresh schema and reject a manually-created stale one.

    `create_all()` intentionally does not alter existing tables. Checking the
    mapped columns immediately makes an old hand-run schema fail at startup
    with an actionable message instead of failing halfway through a demo.
    """
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    stale: list[str] = []
    for name, table in Base.metadata.tables.items():
        actual = {c["name"] for c in inspector.get_columns(name)}
        # `.keys()`, not the columns themselves — iterating a ColumnCollection
        # yields Column objects, and joining those raises "Boolean value of
        # this clause is not defined" from deep inside SQLAlchemy rather than
        # reporting the stale schema this check exists to report.
        missing = set(table.columns.keys()) - actual
        if missing:
            stale.append(f"{name}: {', '.join(sorted(missing))}")
    if stale:
        raise RuntimeError(
            "Database schema is stale. Recreate the synthetic demo database "
            "or apply the project migration before starting: " + "; ".join(stale))


@contextmanager
def get_session() -> Session:
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def db_dep():
    """FastAPI dependency."""
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


# ══════════════════════════════════════════════════════════════════════
#  EVENT BUS  →  WebSocket
# ══════════════════════════════════════════════════════════════════════

class EventBus:
    """Fan-out to every connected browser.

    Bounded queues: a slow client is dropped rather than allowed to grow
    memory without limit. During a 1500x replay we would otherwise emit
    thousands of messages a second into a queue nobody is draining.
    """

    def __init__(self) -> None:
        self._subs: set[asyncio.Queue] = set()

    def publish(self, kind: str, payload: dict[str, Any] | None = None) -> None:
        msg = {
            "kind": kind,
            "payload": payload or {},
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        dead = []
        for q in self._subs:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._subs.discard(q)
            log.warning("dropped a slow websocket subscriber")

    async def subscribe(self) -> AsyncIterator[dict]:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._subs.add(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subs.discard(q)

    @property
    def subscriber_count(self) -> int:
        return len(self._subs)


bus = EventBus()


# ── live counters (flushed into metric_points once a minute) ────────────

class Counters:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.events = 0
        self.alerts = 0
        self.incidents = 0
        self.injections = 0
        self.actions_auto = 0
        self.actions_pending = 0
        self._by_source: dict[str, int] = {}

    def bump(self, name: str, n: int = 1, source: str | None = None) -> None:
        setattr(self, name, getattr(self, name, 0) + n)
        if source:
            self._by_source[source] = self._by_source.get(source, 0) + n

    def snapshot(self) -> dict:
        return {
            "events_processed": self.events,
            "alerts_raised": self.alerts,
            "incidents_open": self.incidents,
            "injections_blocked": self.injections,
            "actions_auto": self.actions_auto,
            "actions_pending": self.actions_pending,
            "by_source": dict(self._by_source),
        }


counters = Counters()
