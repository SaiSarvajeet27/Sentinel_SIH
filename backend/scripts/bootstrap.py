"""One command to prepare a fresh machine.

    python -m scripts.bootstrap

Creates tables, seeds the organisation, loads detection rules, generates the
signing key, and seeds historical incidents so the precedent panel has
something to show. Without that last step the panel renders empty on a fresh
run and looks broken.
"""
from __future__ import annotations

import os
import random
import sys
from datetime import datetime, timedelta, timezone

if sys.platform == "win32":            # emoji/box-drawing output on cp1252 consoles
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, ".")

from app.db import get_session, init_db                      # noqa: E402
from app.models import (AppUser, Feedback, Host, Incident, OrgUser,
                        PlaybookUsage, Rule, Share)            # noqa: E402
from app import auth, config                                   # noqa: E402
from app.services import governance, noise, pipeline, respond  # noqa: E402


def seed_org() -> None:
    pop = noise.population()
    with get_session() as s:
        if s.query(Host).count():
            print("  organisation already seeded")
            return

        for host_id in pop["hosts"]:
            s.add(Host(id=host_id, criticality=1.0, os="Windows 11",
                       coverage=["endpoint", "identity", "network"]))

        # Servers: higher criticality, and deliberately incomplete coverage
        # so the "not seen" line on the incident page is honest.
        s.add(Host(id="DC-01", criticality=3.0, os="Windows Server",
                   department="IT", owner="it_ops",
                   serves=["authentication"], coverage=["identity"]))
        s.add(Host(id="FILESERVER-01", criticality=2.0, os="Windows Server",
                   department="IT", owner="it_ops",
                   serves=[r"\\FILESERVER-01\shared"],
                   coverage=["network", "identity"]))   # no endpoint agent
        s.add(Host(id="MAIL-RELAY", criticality=1.8, os="Linux",
                   department="IT", owner="it_ops",
                   serves=["email"], coverage=["email"]))

        for p in pop["users"]:
            s.add(OrgUser(
                id=p["id"], full_name=p["id"].title(),
                role_title="System Administrator" if p["is_admin"]
                           else f"{p['department']} Officer",
                department=p["department"],
                privilege=2.0 if p["is_admin"] else 1.0,
                primary_host=p["host"]))

        s.add(OrgUser(id="svc_backup", full_name="Backup Service",
                      role_title="Service account", department="IT",
                      privilege=2.5, is_service=True,
                      interactive_login_expected=False))

        s.add(Share(path=r"\\FILESERVER-01\shared", host_id="FILESERVER-01",
                    used_by=[p["id"] for p in pop["users"][:4]]))

        # make the demo victim's host match the default scenario
        h = s.get(Host, "WORKSTATION-04")
        if h:
            h.owner, h.department, h.criticality = "priya", "Accounts", 1.4

    print(f"  seeded {len(pop['hosts'])} hosts + 3 servers, "
          f"{len(pop['users'])} users")


def seed_rules() -> None:
    with get_session() as s:
        for r in pipeline.RULES:
            if not s.get(Rule, r.rule_id):
                s.add(Rule(rule_id=r.rule_id, title=r.title,
                           technique=r.technique, enabled=True,
                           protected=r.protected))
        # one deliberately noisy rule so the retirement queue has an example
        if not s.get(Rule, "long_powershell_cmdline"):
            s.add(Rule(rule_id="long_powershell_cmdline",
                       title="Unusually long PowerShell command line",
                       technique="T1059.001", enabled=True,
                       fired_count=312, fp_count=262,
                       proposed_for_retirement=True))
    print(f"  loaded {len(pipeline.RULES)} detection rules "
          f"({sum(1 for r in pipeline.RULES if r.protected)} protected)")


def seed_playbooks() -> None:
    with get_session() as s:
        counts = {"pb_endpoint_isolation": 12, "pb_phishing_response": 8,
                  "pb_credential_theft": 6, "pb_ransomware_containment": 4}
        for pb in respond.PLAYBOOKS:
            if not s.get(PlaybookUsage, pb["id"]):
                s.add(PlaybookUsage(playbook_id=pb["id"], name=pb["name"],
                                    matched_count=counts.get(pb["id"], 0),
                                    executed_count=counts.get(pb["id"], 0) // 2))
    print(f"  registered {len(respond.PLAYBOOKS)} playbooks")


def seed_history(n: int = 36) -> None:
    """The precedent panel needs a past to look at."""
    rng = random.Random(11)
    with get_session() as s:
        if s.query(Incident).filter(Incident.status != "open").count() >= n:
            print("  history already seeded")
            return

        patterns = [
            (["TA0001", "TA0002", "TA0006", "TA0008", "TA0040"],
             "Credential theft and ransomware staging"),
            (["TA0001", "TA0002"], "Phishing with script execution"),
            (["TA0006", "TA0008"], "Identity abuse across hosts"),
            (["TA0007"], "Network reconnaissance"),
        ]

        for i in range(n):
            tactics, title = patterns[i % len(patterns)]
            when = datetime.now(timezone.utc) - timedelta(days=rng.randint(3, 180))
            stages = pipeline.stages_from_tactics(tactics)
            inc = Incident(
                incident_id=f"inc_hist_{i:03d}",
                title=f"{title} (historical)",
                entity_ids=[f"host:WORKSTATION-{rng.randint(1,12):02d}"],
                first_seen=when, last_seen=when + timedelta(minutes=28),
                tactics=tactics, stages=stages,
                risk_score=45 + sum(stages) * 7,
                risk_factors={"killchain_breadth": sum(stages)},
                status=rng.choice(["closed", "contained", "false_positive"]),
            )
            s.add(inc)
            s.flush()
            verdict = "fp" if inc.status == "false_positive" else "tp"
            s.add(Feedback(incident_id=inc.incident_id, analyst="historic",
                           verdict=verdict, reason_code="seeded"))
    print(f"  seeded {n} historical incidents with verdicts")


def seed_settings() -> None:
    with get_session() as s:
        if governance.get_setting(s, "autonomy") is None:
            governance.set_setting(s, "autonomy", config.DEFAULT_AUTONOMY)
    print("  settings initialised")


def seed_initial_user() -> None:
    """Create the operator accounts.

    Three roles exist and they differ in what they may approve, so the
    seeded set covers all three — otherwise there is no way to demonstrate
    that an analyst *cannot* approve a tier-2 action, which is half the
    point of having roles at all.

    Passwords come from the environment when supplied. When they are not,
    one is generated and printed **once**, which is better than a default
    everybody knows.
    """
    import secrets

    accounts = [
        ("admin_001", "BOOTSTRAP_ADMIN", "manager",
         "SOC Manager", "manager@sentinel.local"),
        ("u_002", "BOOTSTRAP_SENIOR", "senior_analyst",
         "Simran Singh", "simran@sentinel.local"),
        ("u_003", "BOOTSTRAP_ANALYST", "analyst",
         "Arjun Mehta", "arjun@sentinel.local"),
    ]

    created = []
    with get_session() as s:
        if s.query(AppUser).count():
            print("  application users already present")
            return
        for uid, prefix, role, default_name, default_email in accounts:
            email = (os.getenv(f"{prefix}_EMAIL", "").strip().lower()
                     or default_email)
            name = os.getenv(f"{prefix}_NAME", "").strip() or default_name
            password = os.getenv(f"{prefix}_PASSWORD", "")
            generated = False
            if len(password) < 12:
                password = secrets.token_urlsafe(12)
                generated = True
            s.add(AppUser(id=uid, email=email, full_name=name, role=role,
                          password_hash=auth.password_hash(password)))
            created.append((role, email, password if generated else None))

    print("  created 3 accounts:")
    for role, email, generated in created:
        shown = generated or "(from environment)"
        print(f"    {role:15s} {email:28s} {shown}")
    if any(g for _, _, g in created):
        print("\n  ^ these passwords are shown once. Save them now.")


def main() -> None:
    print("Sentinel SOC — bootstrap\n")
    print("• creating tables")
    init_db()
    print("• seeding organisation")
    seed_org()
    print("• loading rules")
    seed_rules()
    print("• registering playbooks")
    seed_playbooks()
    print("• seeding history for the precedent panel")
    seed_history()
    print("• settings")
    seed_settings()
    print("• application identity")
    seed_initial_user()
    print("• generating the ledger signing key")
    governance.public_key_pem()
    governance.append("system", "bootstrap",
                      {"at": datetime.now(timezone.utc).isoformat()})
    print("\nReady.  uvicorn app.main:app --reload --port 8000")


if __name__ == "__main__":
    main()
