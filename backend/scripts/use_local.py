"""Switch every model task to local Ollama. No API key, no network.

    python scripts/use_local.py          # switch to local
    python scripts/use_local.py --hosted # switch back to Gemini

Rewrites the LLM_* lines in .env and leaves everything else alone. Then:

    ollama serve            (in another terminal)
    ollama pull qwen2.5:7b
    python scripts/check_ai.py

This is also the answer to requirement 11 — "without exposing sensitive logs
to external services" stops being a caveat you explain and becomes a
property you demonstrate.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

if sys.platform == "win32":            # emoji/box-drawing output on cp1252 consoles
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"

TASKS = ["SCENARIO", "EXPLAIN", "ANALYSIS", "ASSESS", "TRIAGE",
         "CORRELATE", "SCORE", "REMEDIATION"]

# Gemini carries everything when hosted. `SCORE` stays off — it duplicates
# `ASSESS`, and with one provider a duplicated question is a wasted request.
HOSTED = {t: ("off" if t == "SCORE" else "gemini") for t in TASKS}


def main() -> int:
    if not ENV.exists():
        print("no .env found — copy .env.example to .env first")
        return 1

    local = "--hosted" not in sys.argv
    target = (lambda t: "ollama") if local else (lambda t: HOSTED[t])

    text = ENV.read_text(encoding="utf-8")
    changed = []
    for t in TASKS:
        key, want = f"LLM_{t}", target(t)
        pattern = re.compile(rf"^{key}=.*$", re.M)
        if pattern.search(text):
            before = pattern.search(text).group(0)
            text = pattern.sub(f"{key}={want}", text)
            if before != f"{key}={want}":
                changed.append(key)
        else:
            text += f"\n{key}={want}"
            changed.append(key)

    ENV.write_text(text, encoding="utf-8")

    where = "local Ollama" if local else "hosted (Gemini)"
    print(f"\n  switched {len(changed)} task(s) to {where}")
    for k in changed:
        print(f"    {k}")

    if local:
        print("""
  Now, in another terminal:

      ollama serve
      ollama pull qwen2.5:7b        (~4.7 GB, one time)

  Then:

      python scripts/check_ai.py

  The 7b model is slower than Gemini — expect a few seconds per call rather
  than under one. Everything still works; the narrative just takes longer
  to appear. If it is too slow on your machine, try qwen2.5:3b and set
  OLLAMA_MODEL to match.
""")
    else:
        print("\n  Make sure GEMINI_API_KEY is set in .env, then run "
              "check_ai.py\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
