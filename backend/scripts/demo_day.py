"""One command for demo day.

    python scripts/demo_day.py

Bootstraps if needed, checks everything that can go wrong before it goes
wrong on camera, and tells you what to do about each thing it finds. Run it
the morning of, and again ten minutes before you film.

    python scripts/demo_day.py --serve     also starts uvicorn afterwards
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

if sys.platform == "win32":            # emoji/box-drawing output on cp1252 consoles
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABASE_URL",
                      f"sqlite+pysqlite:///{ROOT / 'sentinel.db'}")

OK, WARN, BAD = "  ok  ", " warn ", " FAIL "
_findings: list[tuple[str, str, str]] = []


def check(status: str, what: str, detail: str = "") -> None:
    _findings.append((status, what, detail))
    print(f"[{status}] {what}")
    if detail:
        print(f"         {detail}")


def main() -> int:
    print("\nSentinel SOC — pre-flight\n" + "─" * 66)

    # ── dependencies ────────────────────────────────────────────────────
    missing = []
    for mod in ("fastapi", "sqlalchemy", "networkx", "ulid",
                "cryptography", "dotenv"):
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        check(BAD, f"{len(missing)} packages missing",
              f"{', '.join(missing)} — run: pip install -r requirements.txt")
        return 1
    check(OK, "dependencies present")

    # ── database ────────────────────────────────────────────────────────
    from app.db import get_session, init_db
    from app.models import Host, Incident, Rule
    init_db()
    with get_session() as s:
        hosts, rules = s.query(Host).count(), s.query(Rule).count()
    if not hosts or not rules:
        print("\n  bootstrapping...\n")
        from scripts import bootstrap
        bootstrap.main()
        with get_session() as s:
            hosts, rules = s.query(Host).count(), s.query(Rule).count()
    check(OK if hosts and rules else BAD,
          f"database ready — {hosts} hosts, {rules} rules")

    # ── constraints actually present ────────────────────────────────────
    from sqlalchemy import text
    from app.db import engine
    if engine.dialect.name == "sqlite":
        with engine.connect() as c:
            ddl = " ".join(r[0] or "" for r in c.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table'")))
            trig = [r[0] for r in c.execute(text(
                "SELECT name FROM sqlite_master WHERE type='trigger'"))]
        n = ddl.count("CHECK")
        check(OK if n >= 5 and trig else WARN,
              f"{n} CHECK constraints, {len(trig)} ledger triggers",
              "" if n >= 5 else "expected at least 5 — schema may be stale")

    # ── providers ───────────────────────────────────────────────────────
    from app import config
    from app.llm import router as llm
    st = llm.provider_status()
    live = [n for n, p in st["providers"].items() if p["available"]]
    if not live:
        check(WARN, "no model provider reachable",
              "The demo still runs — every path falls back to a "
              "deterministic template. Set GEMINI_API_KEY in .env, or "
              "`ollama serve` for the offline path.")
    else:
        check(OK, f"providers available: {', '.join(live)}",
              "fully local" if st["fully_local"] else
              "hosted — rehearse the Ollama path at least once")

    # ── the adversarial suite ───────────────────────────────────────────
    print("\n  running the adversarial suite...\n")
    r = subprocess.run([sys.executable, "-X", "utf8", str(ROOT / "scripts" /
                                            "verify_assist.py")],
                       capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env={**os.environ, "PYTHONIOENCODING": "utf-8",
                            "DATABASE_URL": "sqlite+pysqlite:////tmp/preflight.db"})
    passed = r.stdout.count("PASS")
    check(OK if "ALL CHECKS PASSED" in r.stdout else BAD,
          f"adversarial suite — {passed} checks passed",
          "" if "ALL CHECKS PASSED" in r.stdout
          else (r.stdout or r.stderr)[-400:])

    # ── the state of the board ──────────────────────────────────────────
    with get_session() as s:
        open_inc = s.query(Incident).filter(Incident.status == "open").count()
    if open_inc:
        check(WARN, f"{open_inc} incidents already open",
              "POST /api/demo/reset for a clean board before filming")
    else:
        check(OK, "board is clean")

    # ── the two things that bite on the day ─────────────────────────────
    check(WARN, "run uvicorn WITHOUT --reload",
          "The entity graph lives in memory. --reload restarts on every "
          "file save and empties it mid-take. It now rebuilds from stored "
          "events, but do not rely on that on camera.")
    check(WARN, "rehearse with regenerate=False",
          f"{'AI on' if config.AI_ENABLED else 'AI off'}. Repeat runs of the "
          "same scenario are served from cache, which is what keeps you "
          "inside the free tier for the day.")

    # ── verdict ─────────────────────────────────────────────────────────
    bad = sum(1 for st_, _, _ in _findings if st_ == BAD)
    warn = sum(1 for st_, _, _ in _findings if st_ == WARN)
    print("\n" + "─" * 66)
    if bad:
        print(f"  {bad} blocking problem(s). Fix before filming.")
        return 1
    print(f"  Ready. {warn} thing(s) to keep in mind.\n")
    print("  uvicorn app.main:app --port 8000        (no --reload)")
    print("  POST /api/demo/start  then  /api/demo/play")
    print("  GET  /api/benchmark   — the detection-rate slide")
    print("  GET  /api/assist/balance — the 50:50 slide\n")

    if "--serve" in sys.argv:
        os.execvp("uvicorn", ["uvicorn", "app.main:app", "--port", "8000"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
