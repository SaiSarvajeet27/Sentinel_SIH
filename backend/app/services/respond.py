"""Steps 8–10 — recommend, gate, execute.

Playbook matching is a lookup, not a judgement: the same incident always
produces the same recommendation, and the reasoning is inspectable. The AI
writes the rationale afterwards; it cannot add a step or change a tier.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from ulid import ULID

from app import config
from app.db import bus
from app.models import (Action, Alert, Host, Incident, OrgUser,
                        PlaybookUsage, Share)

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════
#  PLAYBOOKS
# ══════════════════════════════════════════════════════════════════════

PLAYBOOKS = [
    {
        "id": "pb_phishing_response",
        "name": "Phishing Response",
        "addresses": ["T1566.001", "T1204.002"],
        "steps": [
            ("collect_forensics", "affected_host"),
            ("quarantine_email", "source_email"),
            ("block_domain", "sender_domain"),
        ],
        "alternatives": [
            ("quarantine_email_only",
             "Removes the message. Leaves any code already running."),
        ],
    },
    {
        "id": "pb_endpoint_isolation",
        "name": "Endpoint Isolation",
        "addresses": ["T1059.001", "T1053.005", "T1071.001"],
        "steps": [
            ("collect_forensics", "affected_host"),
            ("snapshot_host", "affected_host"),
            ("block_hash", "file_hash"),
            ("isolate_host", "affected_host"),
        ],
        "alternatives": [
            ("monitor_only",
             "No disruption to anyone. The process keeps running."),
            ("block_hash_only",
             "Stops this binary spreading. The host stays compromised."),
        ],
    },
    {
        "id": "pb_credential_theft",
        "name": "Password Reset",
        "addresses": ["T1003.001", "T1078", "T1087.002"],
        "steps": [
            ("collect_forensics", "affected_host"),
            ("force_reauth", "affected_user"),
            ("revoke_session", "affected_user"),
            ("suspend_account", "affected_user"),
        ],
        "alternatives": [
            ("force_reauth_only",
             "Invalidates stolen tokens. The account stays usable."),
        ],
    },
    {
        "id": "pb_ransomware_containment",
        "name": "Malware Containment",
        "addresses": ["T1490", "T1486", "T1083", "T1021.002"],
        "steps": [
            ("collect_forensics", "affected_host"),
            ("snapshot_host", "affected_host"),
            ("isolate_host", "affected_host"),
            ("suspend_account", "affected_user"),
        ],
        "alternatives": [
            ("suspend_account_only",
             "Stops lateral movement. The local process keeps encrypting."),
            ("monitor_only",
             "No disruption. Encryption may complete before you act."),
        ],
    },
]

ACTION_LABELS = {
    "collect_forensics": "Collect forensic snapshot",
    "snapshot_host": "Snapshot host",
    "quarantine_email": "Quarantine originating email",
    "block_hash": "Block file hash",
    "block_domain": "Block sender domain",
    "force_reauth": "Force re-authentication",
    "revoke_session": "Revoke active sessions",
    "suspend_account": "Suspend account",
    "isolate_host": "Isolate host",
    "mass_isolate": "Isolate all affected hosts",
    "disable_service_account": "Disable service account",
    "monitor_only": "Monitor and alert",
}


def match_playbooks(incident: Incident) -> list[dict]:
    """Rank by how much of the incident each playbook actually addresses."""
    from app.db import get_session
    techniques = set()
    with get_session() as s:
        from app.models import Alert
        for a in s.query(Alert).filter(Alert.incident_id == incident.incident_id):
            if a.technique:
                techniques.add(a.technique)

    scored = []
    for pb in PLAYBOOKS:
        overlap = techniques & set(pb["addresses"])
        if overlap:
            scored.append((len(overlap), pb))
    scored.sort(key=lambda x: -x[0])
    return [pb for _, pb in scored]


# ══════════════════════════════════════════════════════════════════════
#  BLAST RADIUS  —  what makes an approval meaningful
# ══════════════════════════════════════════════════════════════════════

def blast_radius(s: Session, kind: str, target: str,
                 incident: Incident) -> dict:
    """"Are you sure?" is not governance. "Four people lose the shared
    drive" is."""
    users, hosts, services, sessions = [], [], [], 0

    if kind in ("isolate_host", "snapshot_host", "mass_isolate"):
        hosts = [target]
        host = s.get(Host, target)
        if host:
            services = list(host.serves or [])
            for path in services:
                sh = s.get(Share, path)
                if sh:
                    users.extend(sh.used_by or [])
            owner = host.owner
            if owner:
                sessions += 1
        sessions = max(sessions, 1)
        summary = (f"{len(hosts)} host · {sessions} active session"
                   f"{'s' if sessions != 1 else ''}")
        if users:
            summary += (f" · {len(set(users))} people lose access to "
                        f"{services[0] if services else 'shared resources'}")

    elif kind in ("suspend_account", "force_reauth", "revoke_session",
                  "disable_service_account"):
        users = [target]
        u = s.get(OrgUser, target)
        sessions = 2 if u and not u.is_service else 1
        hosts = [u.primary_host] if u and u.primary_host else []
        summary = (f"1 account · {sessions} active session"
                   f"{'s' if sessions != 1 else ''}")
        if u and u.role_title:
            summary += f" · {u.role_title}"

    else:
        summary = "No user-visible impact"

    return {
        "users_affected": sorted(set(users)),
        "hosts_affected": hosts,
        "services_affected": services,
        "sessions_killed": sessions,
        "summary": summary,
        "reversible": kind in config.ROLLBACK_WINDOW_HOURS
                      or config.TIERS.get(kind, 0) <= 1,
    }


def _rollback_for(kind: str, target: str) -> dict | None:
    inverse = {
        "isolate_host": "restore_network",
        "suspend_account": "reinstate_account",
        "quarantine_email": "release_email",
        "block_hash": "unblock_hash",
        "block_domain": "unblock_domain",
        "force_reauth": "none_required",
        "revoke_session": "none_required",
        "collect_forensics": "discard_snapshot",
        "snapshot_host": "discard_snapshot",
        "enrich_indicator": "none_required",
        "notify_analyst": "none_required",
    }.get(kind)
    if not inverse:
        return None
    return {"inverse_action": inverse, "target": target}


# ══════════════════════════════════════════════════════════════════════
#  BUILD AND EXECUTE
# ══════════════════════════════════════════════════════════════════════

def _resolve(target_kind: str, incident: Incident,
             s: Session | None = None) -> str | None:
    """Which machine, and whose account.

    This used to take `entity_ids[0]`, and `entity_ids` is stored
    `sorted(set(...))` — so the target was chosen **alphabetically**.
    FILESERVER-01 sorts before WORKSTATION-04 and `arjun` sorts before
    `priya`, which meant an incident correctly titled *"Shadow copies
    deleted on WORKSTATION-04"* produced a plan to isolate the file server
    and suspend a Library Officer who was in the incident by mistake.

    Two functions were answering the same question and only one of them was
    right: `pipeline._title()` already picks the entity on the worst alert.
    So does this now.
    """
    from app.services import pipeline

    host = user = None
    if s is not None:
        worst = max(
            (a for a in s.query(Alert).filter(
                Alert.incident_id == incident.incident_id)),
            key=pipeline._title_rank, default=None)
        if worst:
            host = next((e.split(":", 1)[1] for e in (worst.entities or [])
                         if e.startswith("host:")
                         and e not in pipeline.graph.hubs), None)
            user = next((e.split(":", 1)[1] for e in (worst.entities or [])
                         if e.startswith("user:")), None)

    # Fall back to the incident's own entities, shared infrastructure last.
    if host is None or user is None:
        ordered = pipeline.primary_entities(incident.entity_ids or [])
        host = host or next((e.split(":", 1)[1] for e in ordered
                             if e.startswith("host:")), None)
        user = user or next((e.split(":", 1)[1] for e in ordered
                             if e.startswith("user:")), None)

    # A real hash off the incident's own events, not the string "unknown"
    # rendered onto an approval card.
    file_hash = None
    if s is not None:
        from app.models import Event
        ids = [e for a in s.query(Alert).filter(
            Alert.incident_id == incident.incident_id)
            for e in (a.event_ids or [])]
        if ids:
            row = (s.query(Event)
                    .filter(Event.event_id.in_(ids[:200]),
                            Event.file_hash.isnot(None)).first())
            file_hash = row.file_hash if row else None

    return {
        "affected_host": host,
        "affected_user": user,
        "source_email": "MAIL-RELAY",
        "sender_domain": "university-portal.net",
        "file_hash": file_hash,
    }.get(target_kind)


def build_plan(s: Session, incident: Incident) -> list[Action]:
    """Turn the top playbook into concrete, tiered actions."""
    books = match_playbooks(incident)
    if not books:
        return []
    pb = books[0]

    usage = s.get(PlaybookUsage, pb["id"])
    if not usage:
        usage = PlaybookUsage(playbook_id=pb["id"], name=pb["name"])
        s.add(usage)
    usage.matched_count += 1
    usage.last_used = datetime.now(timezone.utc)

    existing = {a.kind for a in
                s.query(Action).filter(Action.incident_id == incident.incident_id)}

    created: list[Action] = []
    for kind, target_kind in pb["steps"]:
        if kind in existing:
            continue
        target = _resolve(target_kind, incident, s)
        if not target:
            continue

        tier = config.TIERS.get(kind, 2)
        rollback = _rollback_for(kind, target)
        if tier <= 1 and rollback is None:
            # the model would reject this anyway — skip rather than crash
            log.warning("skipping %s: tier %s with no rollback plan", kind, tier)
            continue

        hours = config.ROLLBACK_WINDOW_HOURS.get(kind)
        action = Action(
            action_id=f"act_{str(ULID()).lower()}",
            incident_id=incident.incident_id,
            kind=kind, target=target, tier=tier,
            blast_radius=blast_radius(s, kind, target, incident),
            rollback=rollback,
            rollback_expires_at=(datetime.now(timezone.utc) + timedelta(hours=hours))
                                if hours else None,
            status="pending",
        )
        s.add(action)
        created.append(action)

    s.flush()
    return created


def execute_auto(s: Session, actions: list[Action],
                 autonomy: str | None = None) -> None:
    """Run what is reversible. Hold the rest for a human."""
    from app.services import governance

    mode = autonomy or governance.get_setting(s, "autonomy", config.DEFAULT_AUTONOMY)
    auto_max = config.AUTONOMY_MODES.get(mode, {}).get("auto_max", 1)

    for a in actions:
        if a.tier <= auto_max:
            _simulate(a)
            a.status = "executed"
            a.executed_at = datetime.now(timezone.utc)
            governance.append_ledger(s, "system", "action_executed",
                                     {"action_id": a.action_id, "kind": a.kind,
                                      "target": a.target, "tier": a.tier})
            bus.publish("action.executed", {"action_id": a.action_id,
                                            "kind": a.kind, "target": a.target})
        else:
            governance.append_ledger(s, "system", "approval_requested",
                                     {"action_id": a.action_id, "kind": a.kind,
                                      "target": a.target, "tier": a.tier})
            governance.notify(s, "approval",
                              f"Approval required: {ACTION_LABELS.get(a.kind, a.kind)}",
                              a.blast_radius.get("summary", ""),
                              "/approvals", "senior_analyst",
                              action_id=a.action_id)
            bus.publish("action.pending", {"action_id": a.action_id,
                                           "kind": a.kind, "tier": a.tier})


def _simulate(action: Action) -> None:
    """There is no real infrastructure. Record the intent and a believable
    result — and label it clearly as simulated in the interface."""
    action.result = {
        "simulated": True,
        "message": f"{ACTION_LABELS.get(action.kind, action.kind)} "
                   f"applied to {action.target}",
        "at": datetime.now(timezone.utc).isoformat(),
    }


def approve(s: Session, action: Action, user_id: str, role: str,
            reason: str) -> dict:
    """Requirement: high-impact actions must require human authorization."""
    if action.status not in {"pending", "partially_approved"}:
        raise ValueError(f"cannot approve an action that is {action.status}")
    perms = config.ROLE_PERMISSIONS.get(role, {})
    needed = "approve_tier_3" if action.tier >= 3 else "approve_tier_2"
    if not perms.get(needed):
        raise PermissionError(f"role '{role}' cannot {needed}")
    if user_id in (action.approved_by or []):
        raise ValueError("you have already approved this action")

    from app.services import governance
    action.approved_by = (action.approved_by or []) + [user_id]
    action.approval_reason = reason

    required = 2 if action.tier >= 3 else 1
    if len(action.approved_by) >= required:
        _simulate(action)
        action.status = "executed"
        action.executed_at = datetime.now(timezone.utc)
        governance.append_ledger(s, user_id, "action_approved_executed",
                                 {"action_id": action.action_id,
                                  "kind": action.kind, "target": action.target,
                                  "reason": reason, "approvers": action.approved_by})
        bus.publish("action.executed", {"action_id": action.action_id,
                                        "kind": action.kind, "approved": True})
        governance.mark_notifications_read_for_action(s, action.action_id)
        # A tier-2+ action is disruptive by definition (the tier is what
        # forces the approval in the first place) — once one actually
        # executes, the incident has moved from "under attack" to "under
        # control". A human can still relabel it via PUT .../status.
        incident = s.get(Incident, action.incident_id)
        if incident and incident.status == "open":
            incident.status = "contained"
            governance.append_ledger(s, "system", "incident_status_changed",
                                     {"incident_id": incident.incident_id,
                                      "from": "open", "to": "contained",
                                      "caused_by_action": action.action_id})
            bus.publish("incident.updated", {"incident_id": incident.incident_id,
                                             "status": "contained"})
    else:
        action.status = "partially_approved"
        governance.append_ledger(s, user_id, "action_partially_approved",
                                 {"action_id": action.action_id,
                                  "approvers": action.approved_by})

    return {"status": action.status, "approved_by": action.approved_by}


def override(s: Session, action: Action, chosen_kind: str, user_id: str,
             reason: str) -> Action:
    """What the analyst did INSTEAD — a richer signal than a rejection."""
    from app.models import Override
    from app.services import governance

    if action.status not in {"pending", "partially_approved"}:
        raise ValueError(f"cannot override an action that is {action.status}")
    if chosen_kind not in config.TIERS:
        raise ValueError("chosen action is not in the approved vocabulary")

    action.status = "rejected"
    governance.mark_notifications_read_for_action(s, action.action_id)
    s.add(Override(action_id=action.action_id, incident_id=action.incident_id,
                   recommended_action=action.kind, chosen_action=chosen_kind,
                   reason=reason, analyst=user_id))

    incident = s.get(Incident, action.incident_id)
    target = _resolve("affected_host" if "host" in chosen_kind
                      else "affected_user", incident, s) or action.target
    tier = config.TIERS.get(chosen_kind, 1)
    rollback = _rollback_for(chosen_kind, target) or {"inverse_action": "none_required",
                                                      "target": target}

    replacement = Action(
        action_id=f"act_{str(ULID()).lower()}",
        incident_id=action.incident_id, kind=chosen_kind, target=target,
        tier=tier, blast_radius=blast_radius(s, chosen_kind, target, incident),
        rollback=rollback, status="pending", override_of=action.action_id,
    )
    s.add(replacement)
    governance.append_ledger(s, user_id, "action_overridden",
                             {"was": action.kind, "chose": chosen_kind,
                              "reason": reason})
    s.flush()
    return replacement


def rollback(s: Session, action: Action, user_id: str) -> dict:
    from app.services import governance
    if action.status != "executed":
        raise ValueError(f"cannot roll back an action that is {action.status}")
    if not action.rollback:
        raise ValueError("this action has no rollback plan")
    if action.rollback_expires_at and \
       datetime.now(timezone.utc) > action.rollback_expires_at:
        raise ValueError("the rollback window for this action has closed")

    action.status = "rolled_back"
    governance.append_ledger(s, user_id, "action_rolled_back",
                             {"action_id": action.action_id, "kind": action.kind})
    bus.publish("action.rolled_back", {"action_id": action.action_id})
    return {"status": "rolled_back"}


def alternatives_for(incident: Incident) -> list[dict]:
    """The system has an opinion. It does not pretend it is the only option."""
    books = match_playbooks(incident)
    if not books:
        return []
    pb = books[0]
    primary = next((k for k, _ in reversed(pb["steps"])
                    if config.TIERS.get(k, 0) >= 2), pb["steps"][-1][0])

    out = [{"action": primary, "label": ACTION_LABELS.get(primary, primary),
            "recommended": True,
            "tradeoff": "Stops the attack progressing. Disrupts the user.",
            "tier": config.TIERS.get(primary, 2)}]
    for kind, tradeoff in pb.get("alternatives", []):
        out.append({"action": kind, "label": ACTION_LABELS.get(kind, kind),
                    "recommended": False, "tradeoff": tradeoff,
                    "tier": config.TIERS.get(kind, 1)})
    return out
