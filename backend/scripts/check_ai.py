"""Are the keys working? One cheap call per provider, then a real one.

    python scripts/check_ai.py

Costs 2-3 requests against your daily quota. Run it after pasting keys, and
once more the morning of the demo. It never prints a key.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

if sys.platform == "win32":            # emoji/box-drawing output on cp1252 consoles
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL",
                      f"sqlite+pysqlite:///{ROOT / 'sentinel.db'}")

from app import config                                   # noqa: E402
from app.llm import router                               # noqa: E402
from app.llm.providers import get_provider               # noqa: E402

BAR = "─" * 66


def mask(v: str) -> str:
    """Enough to tell two keys apart. Not enough to use one."""
    if not v:
        return "(not set)"
    return f"{v[:6]}…{v[-4:]}  ({len(v)} chars)"


def _list_gemini_models() -> None:
    """Ask Google which models this key can actually reach.

    A 404 on `:generateContent` means the model name is wrong for this API
    version, and guessing is slower than asking.
    """
    import httpx
    try:
        r = httpx.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": config.GEMINI_API_KEY}, timeout=30.0)
        r.raise_for_status()
        names = [m["name"].split("/")[-1] for m in r.json().get("models", [])
                 if "generateContent" in m.get("supportedGenerationMethods",
                                               [])]
    except Exception as e:                                   # noqa: BLE001
        print(f"           could not list models: {str(e)[:110]}")
        return

    flash = [n for n in names if "flash" in n and "thinking" not in n]
    print(f"           this key can reach {len(names)} models. Good "
          f"candidates:")
    for n in (flash or names)[:6]:
        print(f"             {n}")
    print("           set GEMINI_MODEL in .env to one of those.")


def main() -> int:
    print(f"\nSentinel SOC — provider check\n{BAR}")

    print("keys, as loaded:")
    print(f"  GEMINI_API_KEY  {mask(config.GEMINI_API_KEY)}")
    print(f"  AI_ENABLED      {config.AI_ENABLED}")
    print(f"  DUAL_PATH       {config.DUAL_PATH_ENABLED}")

    # ── the mistake that costs you a key ────────────────────────────────
    # .env is gitignored. .env.example is meant to be committed. Putting a
    # real key in the second one is easy to do and easy not to notice.
    from dotenv import dotenv_values
    example = ROOT / ".env.example"
    if example.exists():
        ex = dotenv_values(example)
        leaked = [k for k in ("GEMINI_API_KEY",)
                  if (ex.get(k) or "").strip()]
        if leaked:
            print(f"\n  ⚠ {' and '.join(leaked)} has a value in .env.example")
            print("    That file is committed. Blank it, keep keys in .env")
            print("    only, and rotate anything that has been pushed.")

    print("\nrouting:")
    for task, prov in config.TASK_PROVIDER.items():
        bad = prov not in ("gemini", "ollama", "off")
        print(f"  {task:12s} -> {prov}" + ("   <-- not a valid provider" if bad else ""))

    # Key shape. Both of these are valid — Google is mid-migration.
    g = config.GEMINI_API_KEY
    if g:
        kind = ("authorization key (current)" if g.startswith("AQ.")
                else "standard key (legacy — Google rejects these from "
                     "September 2026)" if g.startswith("AIza")
                else "unrecognised format")
        print(f"\n  GEMINI_API_KEY is an {kind}")

    print(f"\n{BAR}\nlive calls\n{BAR}")
    results = {}
    for name in ("gemini", "ollama"):
        p = get_provider(name)
        if not p.available():
            reason = ("no key set" if name == "gemini"
                      else "no local server — run `ollama serve`")
            print(f"  {name:8s} skipped — {reason}")
            results[name] = None
            continue

        t0 = time.time()
        r = p.complete(
            "You are a test harness. Reply with JSON only.",
            'Return exactly {"ok": true}',
            {"type": "object", "required": ["ok"],
             "properties": {"ok": {"type": "boolean"}}},
            60, 0.0)
        dt = int((time.time() - t0) * 1000)
        results[name] = r.ok

        if r.ok:
            print(f"  {name:8s} WORKING   {dt}ms   model={p.model}")
        else:
            print(f"  {name:8s} FAILED    {r.status}")
            print(f"           {r.error[:200]}")
            if "401" in (r.error or "") or "invalid" in (r.error or "").lower():
                print("           -> the key is wrong or revoked. Reissue it.")
            elif "429" in (r.error or ""):
                print("           -> rate limited. Wait a minute, or you have "
                      "burned today's quota.")
            elif "403" in (r.error or ""):
                print("           -> forbidden. Usually a key restricted to "
                      "the wrong API, or a network policy blocking the "
                      "domain.")
            elif "404" in (r.error or "") and name == "gemini":
                _list_gemini_models()

    # ── the one that matters: a real task through the router ────────────
    print(f"\n{BAR}\none real task through the router\n{BAR}")
    r = router.ask(
        task="assess",
        system="You are a security analyst. Return JSON only.",
        user="An account read credentials from process memory, then "
             "authenticated to a file server it had never touched. "
             'Return {"score": <0-100>, "band": "High Confidence", '
             '"reasoning": "<one sentence>"}',
        json_schema={"type": "object", "required": ["score", "reasoning"],
                     "properties": {"score": {"type": "number"},
                                    "band": {"type": "string"},
                                    "reasoning": {"type": "string"}}},
        max_tokens=200)

    if r.ok:
        print(f"  provider   {r.provider} ({r.model})")
        print(f"  score      {r.data.get('score')}")
        print(f"  reasoning  {str(r.data.get('reasoning', ''))[:150]}")
        print("\n  The model is answering, and the answer parses. That is the "
              "whole path\n  the dual-path assessment uses.")
    else:
        print(f"  FAILED — status={r.status}")
        print(f"  {r.error[:200]}")
        print("\n  The application still runs. Every path falls back to a "
              "deterministic\n  template, which is why AI_ENABLED=false is a "
              "demo feature and not a\n  failure mode. But you would be "
              "filming without the model.")

    live = [n for n, ok in results.items() if ok]
    print(f"\n{BAR}")
    if r.ok:
        print(f"  Ready. Working providers: {', '.join(live)}")
        print("  Next:  python scripts/demo_day.py   then start the server\n")
        return 0
    print("  Not ready — no provider completed a call.\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
