"""Free-tier budget manager.

The free limits are real and they are not generous:

    Gemini  varies per project. Google stopped publishing a fixed table;
            yours is at https://aistudio.google.com/rate-limit

A naive implementation makes one call per explanation field — reasoning
steps, limitations, evidence, alternatives, both sides, rationale — which is
eight calls per incident. Six incidents in a demo run is 48 calls, and a
second run puts you near the minute limit.

Two things fix that, and both live here:

  1. **Batch.** One structured call returns every field at once. Eight calls
     become one.
  2. **Cache by content hash.** Re-running the same scenario costs nothing,
     which matters because you will rehearse the demo many times.

This module tracks spend, enforces the limits before we hit them, and
reports what is left so the interface can show it honestly.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field

log = logging.getLogger(__name__)


@dataclass
class Budget:
    """Conservative — sits below the published ceiling so a burst near the
    end of a demo cannot tip us over."""
    per_minute: int
    per_day: int
    tokens_per_minute: int = 0

    calls_minute: deque = field(default_factory=deque)
    calls_day: deque = field(default_factory=deque)
    tokens_minute: deque = field(default_factory=deque)

    def _prune(self, now: float) -> None:
        while self.calls_minute and now - self.calls_minute[0] > 60:
            self.calls_minute.popleft()
        while self.calls_day and now - self.calls_day[0] > 86_400:
            self.calls_day.popleft()
        while self.tokens_minute and now - self.tokens_minute[0][0] > 60:
            self.tokens_minute.popleft()

    def allows(self, est_tokens: int = 0) -> tuple[bool, str]:
        now = time.time()
        self._prune(now)
        if len(self.calls_minute) >= self.per_minute:
            return False, "per-minute request limit"
        if len(self.calls_day) >= self.per_day:
            return False, "daily request limit"
        if self.tokens_per_minute:
            used = sum(t for _, t in self.tokens_minute)
            if used + est_tokens > self.tokens_per_minute:
                return False, "per-minute token limit"
        return True, ""

    def record(self, tokens: int = 0) -> None:
        now = time.time()
        self.calls_minute.append(now)
        self.calls_day.append(now)
        if tokens:
            self.tokens_minute.append((now, tokens))

    def remaining(self) -> dict:
        now = time.time()
        self._prune(now)
        return {
            "minute": max(0, self.per_minute - len(self.calls_minute)),
            "day": max(0, self.per_day - len(self.calls_day)),
            "tokens_minute": (max(0, self.tokens_per_minute -
                                  sum(t for _, t in self.tokens_minute))
                              if self.tokens_per_minute else None),
        }


# Deliberately below the published free-tier ceilings.
from app import config as _cfg

BUDGETS: dict[str, Budget] = {
    "gemini": Budget(per_minute=_cfg.GEMINI_RPM, per_day=_cfg.GEMINI_RPD),
    "groq":   Budget(per_minute=_cfg.GROQ_RPM, per_day=_cfg.GROQ_RPD),
    "ollama": Budget(per_minute=999, per_day=999_999),   # local, unlimited
}

_lock = threading.Lock()

# ── response cache ──────────────────────────────────────────────────────
# Keyed on the content of the request, so a repeated demo run is free.
_cache: dict[str, dict] = {}
_cache_hits = 0
_cache_misses = 0


def cache_key(task: str, payload: dict) -> str:
    blob = json.dumps({"task": task, "payload": payload},
                      sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def cached(key: str) -> dict | None:
    global _cache_hits, _cache_misses
    with _lock:
        hit = _cache.get(key)
        if hit is not None:
            _cache_hits += 1
            return hit
        _cache_misses += 1
        return None


def store(key: str, value: dict) -> None:
    with _lock:
        if len(_cache) > 500:
            _cache.pop(next(iter(_cache)))
        _cache[key] = value


def check(provider: str, est_tokens: int = 800) -> tuple[bool, str]:
    b = BUDGETS.get(provider)
    if not b:
        return True, ""
    with _lock:
        return b.allows(est_tokens)


# How long we are willing to sit and wait for a per-minute window to open.
MAX_WAIT_SECONDS = 25.0


def wait_for_slot(provider: str, est_tokens: int = 800) -> tuple[bool, str]:
    """Block briefly if the *per-minute* window is full, then retry.

    With two hosted providers a rate limit meant "use the other one". With
    one, it means the incident silently gets a deterministic template
    instead of a written analysis — the demo does not break, it just
    quietly gets worse, which is harder to notice and worse to discover on
    camera.

    A per-minute limit clears on its own within a minute, so waiting a few
    seconds is almost always better than degrading. A per-day limit does
    not clear, so we do not wait for it.
    """
    b = BUDGETS.get(provider)
    if not b:
        return True, ""

    deadline = time.time() + MAX_WAIT_SECONDS
    while True:
        with _lock:
            ok, why = b.allows(est_tokens)
        if ok:
            return True, ""
        if "day" in why:                      # will not clear by waiting
            return False, why
        if time.time() >= deadline:
            return False, f"{why} (waited {MAX_WAIT_SECONDS:.0f}s)"
        log.info("%s %s — waiting for the window to clear", provider, why)
        time.sleep(2.0)


def record(provider: str, tokens: int = 800) -> None:
    b = BUDGETS.get(provider)
    if not b:
        return
    with _lock:
        b.record(tokens)


def status() -> dict:
    """Surfaced on the settings page — honest about what is left."""
    with _lock:
        total = _cache_hits + _cache_misses
        return {
            "providers": {name: b.remaining() for name, b in BUDGETS.items()},
            "cache": {
                "entries": len(_cache),
                "hits": _cache_hits,
                "misses": _cache_misses,
                "hit_rate": round(_cache_hits / total, 3) if total else 0.0,
            },
        }


def reset_cache() -> None:
    global _cache_hits, _cache_misses
    with _lock:
        _cache.clear()
        _cache_hits = _cache_misses = 0
