"""SQLAlchemy models — mirrors db/schema.sql.

Every field carries the problem-statement clause it satisfies, so the schema
documents the requirements rather than sitting apart from them.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (DDL, JSON, Boolean, CheckConstraint, DateTime, Float,
                        ForeignKey, Integer, String, Text, event, func)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


# ══════════════════════════════════════════════════════════════════════
#  ORGANISATION — the facts scoring, blast radius and both-sides need
# ══════════════════════════════════════════════════════════════════════

class Host(Base):
    __tablename__ = "hosts"
    id:          Mapped[str] = mapped_column(String, primary_key=True)
    owner:       Mapped[str | None] = mapped_column(String)
    department:  Mapped[str | None] = mapped_column(String)
    criticality: Mapped[float] = mapped_column(Float, default=1.0)
    os:          Mapped[str | None] = mapped_column(String)
    serves:      Mapped[list] = mapped_column(JSON, default=list)
    coverage:    Mapped[list] = mapped_column(JSON, default=list)  # blind spots


class OrgUser(Base):
    __tablename__ = "org_users"
    id:           Mapped[str] = mapped_column(String, primary_key=True)
    full_name:    Mapped[str | None] = mapped_column(String)
    role_title:   Mapped[str | None] = mapped_column(String)
    department:   Mapped[str | None] = mapped_column(String)
    privilege:    Mapped[float] = mapped_column(Float, default=1.0)
    primary_host: Mapped[str | None] = mapped_column(String)
    is_service:   Mapped[bool] = mapped_column(Boolean, default=False)
    interactive_login_expected: Mapped[bool] = mapped_column(Boolean, default=True)


class Share(Base):
    __tablename__ = "shares"
    path:    Mapped[str] = mapped_column(String, primary_key=True)
    host_id: Mapped[str | None] = mapped_column(String)
    used_by: Mapped[list] = mapped_column(JSON, default=list)


# ══════════════════════════════════════════════════════════════════════
#  PIPELINE
# ══════════════════════════════════════════════════════════════════════

class Event(Base):
    """Requirement: correlates endpoint, identity, email and network events."""
    __tablename__ = "events"
    event_id:   Mapped[str] = mapped_column(String, primary_key=True)
    ts:         Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source:     Mapped[str] = mapped_column(String)
    class_name: Mapped[str] = mapped_column(String)

    actor_user:     Mapped[str | None] = mapped_column(String, index=True)
    src_host:       Mapped[str | None] = mapped_column(String, index=True)
    dst_host:       Mapped[str | None] = mapped_column(String)
    src_ip:         Mapped[str | None] = mapped_column(String)
    dst_ip:         Mapped[str | None] = mapped_column(String)
    process:        Mapped[str | None] = mapped_column(String)
    parent_process: Mapped[str | None] = mapped_column(String)
    file_hash:      Mapped[str | None] = mapped_column(String)
    domain:         Mapped[str | None] = mapped_column(String)
    outcome:        Mapped[str | None] = mapped_column(String)

    # Requirement: resist prompt injection.
    # Everything an attacker could have chosen lives here and nowhere else.
    untrusted: Mapped[dict] = mapped_column(JSON, default=dict)

    raw_ref:   Mapped[str] = mapped_column(String)
    raw_hash:  Mapped[str] = mapped_column(String)   # evidence provenance
    synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    run_id:    Mapped[str | None] = mapped_column(String, index=True)

    # The technique this event was GENERATED for, when we generated it.
    # Ground truth, used only by /api/benchmark to measure detection rate.
    # **No detection rule reads this.** If one ever did, the measurement
    # would be circular and worthless.
    truth_technique: Mapped[str | None] = mapped_column(String, index=True)


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        # Only a written rule may call something critical, because only a
        # rule can be reviewed before it fires.
        #
        # This lived in db/schema.sql, which is PostgreSQL DDL that nothing
        # executes — `bootstrap.py` builds the schema through
        # `Base.metadata.create_all()`. So the README claimed a constraint
        # the running database did not have, and inserting a critical
        # ai_triage alert succeeded. Declared here, SQLAlchemy emits it for
        # SQLite and Postgres alike.
        CheckConstraint(
            "origin <> 'ai_triage' OR severity IN "
            "('informational', 'low', 'medium')",
            name="ai_alerts_capped"),
        CheckConstraint(
            "origin IN ('rule', 'injection', 'ai_triage', 'ai_analysis')",
            name="alert_origin_known"),
    )
    alert_id:     Mapped[str] = mapped_column(String, primary_key=True)
    event_ids:    Mapped[list] = mapped_column(JSON, default=list)
    rule_id:      Mapped[str] = mapped_column(String, index=True)
    rule_title:   Mapped[str] = mapped_column(String)
    severity:     Mapped[str] = mapped_column(String)
    technique:    Mapped[str | None] = mapped_column(String)
    tactic:       Mapped[str | None] = mapped_column(String)
    entities:     Mapped[list] = mapped_column(JSON, default=list)
    detected_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True))
    dedupe_count: Mapped[int] = mapped_column(Integer, default=1)
    incident_id:  Mapped[str | None] = mapped_column(String, index=True)
    run_id:       Mapped[str | None] = mapped_column(String)

    # Where this alert came from. "rule" is a written Sigma rule, "injection"
    # is the untrusted-field boundary, "ai_triage" is the model reviewing
    # what the rules missed. Recorded so the interface can say which, and so
    # an AI-only incident is visible as one.
    origin:        Mapped[str] = mapped_column(String, default="rule", index=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    ai_reason:     Mapped[str | None] = mapped_column(Text)
    anomalies:     Mapped[list] = mapped_column(JSON, default=list)


class Incident(Base):
    """Requirement: explains likely attack chains."""
    __tablename__ = "incidents"
    __table_args__ = (
        # The model's room to move a score, as a column constraint rather
        # than a request in a prompt.
        CheckConstraint("ai_score_delta BETWEEN -10 AND 15",
                        name="ai_delta_clamped"),
        CheckConstraint(
            "model_score IS NULL OR (model_score BETWEEN 0 AND 100)",
            name="model_score_in_range"),
        # The second analyst can escalate and cannot dismiss. This is the
        # property the whole design rests on, so it does not depend on one
        # Python function staying correct.
        CheckConstraint(
            "model_score IS NULL OR "
            "risk_score >= base_score + ai_score_delta - 0.01",
            name="model_never_lowers"),
        CheckConstraint(
            "agreement IN ('agreed', 'minor_disagreement', "
            "'disagreement', 'single_path')",
            name="agreement_known"),
    )
    incident_id: Mapped[str] = mapped_column(String, primary_key=True)
    title:       Mapped[str] = mapped_column(String)
    entity_ids:  Mapped[list] = mapped_column(JSON, default=list)
    first_seen:  Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen:   Mapped[datetime] = mapped_column(DateTime(timezone=True))

    tactics: Mapped[list] = mapped_column(JSON, default=list)
    stages:  Mapped[list] = mapped_column(JSON, default=list)   # 7 booleans

    risk_score:        Mapped[float] = mapped_column(Float, default=0.0, index=True)
    risk_factors:      Mapped[dict] = mapped_column(JSON, default=dict)
    confidence_band:   Mapped[str | None] = mapped_column(String)
    confidence_driver: Mapped[str | None] = mapped_column(Text)

    # The deterministic score, kept whether or not the model ever runs.
    # risk_score = base_score + ai_score_delta, and the delta is clamped in
    # policy. Both are stored so the interface can show the arithmetic and
    # so "what would this have been without the AI" is always answerable.
    base_score:      Mapped[float] = mapped_column(Float, default=0.0)
    ai_score_delta:  Mapped[float] = mapped_column(Float, default=0.0)
    ai_score_reason: Mapped[str | None] = mapped_column(Text)
    ai_score_status: Mapped[str] = mapped_column(String, default="not_run")

    # ── the second analyst's own verdict ─────────────────────────────────
    # Reached without seeing base_score. Stored separately and displayed
    # beside it, because the comparison is the product: two independent
    # methods agreeing is evidence, and two disagreeing is a finding.
    model_score:     Mapped[float | None] = mapped_column(Float)
    model_band:      Mapped[str | None] = mapped_column(String)
    model_reasoning: Mapped[str | None] = mapped_column(Text)
    model_status:    Mapped[str] = mapped_column(String, default="not_run")

    # agreed | minor_disagreement | disagreement | single_path
    agreement:        Mapped[str] = mapped_column(String, default="single_path")
    agreement_detail: Mapped[dict] = mapped_column(JSON, default=dict)
    # Set when the two paths diverge far enough that a person should look,
    # whatever the score says.
    needs_review:     Mapped[bool] = mapped_column(Boolean, default=False)

    narrative:        Mapped[dict | None] = mapped_column(JSON)
    narrative_status: Mapped[str] = mapped_column(String, default="pending")
    both_sides:       Mapped[dict | None] = mapped_column(JSON)

    # the explanation tabs — all produced by ONE batched model call
    reasoning_steps:  Mapped[list] = mapped_column(JSON, default=list)
    evidence:         Mapped[list] = mapped_column(JSON, default=list)
    limitations:      Mapped[list] = mapped_column(JSON, default=list)
    what_would_change: Mapped[list] = mapped_column(JSON, default=list)
    rationale:        Mapped[str | None] = mapped_column(Text)
    category:         Mapped[str] = mapped_column(String, default="security")
    consistency_flag: Mapped[bool] = mapped_column(Boolean, default=False)

    injection_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    injection_details:  Mapped[list] = mapped_column(JSON, default=list)
    blind_spots:        Mapped[list] = mapped_column(JSON, default=list)
    source_breakdown:   Mapped[dict] = mapped_column(JSON, default=dict)

    status:      Mapped[str] = mapped_column(String, default="open", index=True)
    merged_into: Mapped[str | None] = mapped_column(String)
    assigned_to: Mapped[str | None] = mapped_column(String)
    run_id:      Mapped[str | None] = mapped_column(String)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Action(Base):
    """Requirements: execute only pre-approved low-risk actions;
    high-impact actions must require human authorization."""
    __tablename__ = "actions"
    __table_args__ = (
        # Automate only what you can undo — enforced by the database.
        CheckConstraint("tier > 1 OR rollback IS NOT NULL",
                        name="reversible_if_auto"),
    )
    action_id:   Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.incident_id"))
    kind:        Mapped[str] = mapped_column(String)
    target:      Mapped[str] = mapped_column(String)
    tier:        Mapped[int] = mapped_column(Integer)

    blast_radius: Mapped[dict] = mapped_column(JSON, default=dict)
    rollback:     Mapped[dict | None] = mapped_column(JSON)
    rollback_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rationale:    Mapped[str | None] = mapped_column(Text)

    status:       Mapped[str] = mapped_column(String, default="pending", index=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                   server_default=func.now())
    approved_by:     Mapped[list] = mapped_column(JSON, default=list)
    approval_reason: Mapped[str | None] = mapped_column(Text)
    escalated_to:    Mapped[str | None] = mapped_column(String)
    override_of:     Mapped[str | None] = mapped_column(String)
    executed_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result:          Mapped[dict | None] = mapped_column(JSON)


# ══════════════════════════════════════════════════════════════════════
#  GOVERNANCE
# ══════════════════════════════════════════════════════════════════════

class LedgerEntry(Base):
    """Requirement: maintain evidence provenance.
    Append-only — a database trigger rejects UPDATE and DELETE."""
    __tablename__ = "ledger"
    seq:          Mapped[int] = mapped_column(Integer, primary_key=True,
                                              autoincrement=True)
    ts:           Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                   server_default=func.now())
    actor:        Mapped[str] = mapped_column(String)
    action_type:  Mapped[str] = mapped_column(String)
    payload:      Mapped[dict] = mapped_column(JSON)
    payload_hash: Mapped[str] = mapped_column(String)
    prev_hash:    Mapped[str] = mapped_column(String)
    entry_hash:   Mapped[str] = mapped_column(String)
    signature:    Mapped[str] = mapped_column(Text)


# ── Ledger immutability, on whichever database is actually running ──────
#
# `db/schema.sql` carries a plpgsql trigger, and nothing executes that file —
# the schema is built by `Base.metadata.create_all()`. So the ledger was
# append-only by convention on SQLite, and a direct UPDATE succeeded.
#
# These emit a real trigger on both dialects after the table is created.
# The hash chain catches tampering regardless, and that is the stronger
# defence; this closes the gap between what the README claims and what the
# database does.

_SQLITE_LEDGER_GUARD = DDL("""
CREATE TRIGGER IF NOT EXISTS ledger_no_update
BEFORE UPDATE ON ledger
BEGIN
    SELECT RAISE(ABORT, 'ledger is append-only');
END;
""")

_SQLITE_LEDGER_GUARD_DEL = DDL("""
CREATE TRIGGER IF NOT EXISTS ledger_no_delete
BEFORE DELETE ON ledger
BEGIN
    SELECT RAISE(ABORT, 'ledger is append-only');
END;
""")

_PG_LEDGER_GUARD = DDL("""
CREATE OR REPLACE FUNCTION ledger_is_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON ledger;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger
    FOR EACH ROW EXECUTE FUNCTION ledger_is_immutable();
""")

event.listen(LedgerEntry.__table__, "after_create",
             _SQLITE_LEDGER_GUARD.execute_if(dialect="sqlite"))
event.listen(LedgerEntry.__table__, "after_create",
             _SQLITE_LEDGER_GUARD_DEL.execute_if(dialect="sqlite"))
event.listen(LedgerEntry.__table__, "after_create",
             _PG_LEDGER_GUARD.execute_if(dialect="postgresql"))


class AppUser(Base):
    __tablename__ = "app_users"
    id:            Mapped[str] = mapped_column(String, primary_key=True)
    email:         Mapped[str] = mapped_column(String, unique=True)
    full_name:     Mapped[str] = mapped_column(String)
    role:          Mapped[str] = mapped_column(String, default="analyst")
    password_hash: Mapped[str] = mapped_column(String)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                    server_default=func.now())


class Rule(Base):
    __tablename__ = "rules"
    rule_id:     Mapped[str] = mapped_column(String, primary_key=True)
    title:       Mapped[str] = mapped_column(String)
    technique:   Mapped[str | None] = mapped_column(String)
    enabled:     Mapped[bool] = mapped_column(Boolean, default=True)
    protected:   Mapped[bool] = mapped_column(Boolean, default=False)  # unfilterable
    fired_count: Mapped[int] = mapped_column(Integer, default=0)
    fp_count:    Mapped[int] = mapped_column(Integer, default=0)
    proposed_for_retirement: Mapped[bool] = mapped_column(Boolean, default=False)


class Feedback(Base):
    """Requirement: learn from analyst feedback."""
    __tablename__ = "feedback"
    id:          Mapped[int] = mapped_column(Integer, primary_key=True,
                                             autoincrement=True)
    incident_id: Mapped[str] = mapped_column(String)
    analyst:     Mapped[str] = mapped_column(String)
    verdict:     Mapped[str] = mapped_column(String)      # tp|fp|needs_review
    reason_code: Mapped[str | None] = mapped_column(String)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Override(Base):
    """The richest learning signal — what the human did INSTEAD."""
    __tablename__ = "overrides"
    id:                 Mapped[int] = mapped_column(Integer, primary_key=True,
                                                    autoincrement=True)
    action_id:          Mapped[str] = mapped_column(String)
    incident_id:        Mapped[str] = mapped_column(String)
    recommended_action: Mapped[str] = mapped_column(String)
    chosen_action:      Mapped[str] = mapped_column(String)
    reason:             Mapped[str | None] = mapped_column(Text)
    analyst:            Mapped[str] = mapped_column(String)
    created_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                         server_default=func.now())


class CampaignLink(Base):
    """A link the model believes exists between two incidents.

    The entity graph connects things that share an entity within a weighted
    hop budget. It cannot connect an attacker who compromises one account,
    harvests a second, and continues from a machine that shares nothing with
    the first — there is no edge to walk.

    The model can see that pattern in the shape of the two incidents. So it
    proposes, a deterministic gate checks the proposal against timing and
    kill-chain ordering, and **a human accepts it.** Nothing merges on the
    strength of a sentence the model wrote.
    """
    __tablename__ = "campaign_links"
    __table_args__ = (
        CheckConstraint("kind IN ('link', 'split')", name="campaign_link_kind_known"),
        CheckConstraint("status IN ('proposed', 'rejected', 'accepted', 'declined')",
                        name="campaign_link_status_known"),
        CheckConstraint("status NOT IN ('accepted', 'declined') OR decided_by IS NOT NULL",
                        name="decided_links_have_an_author"),
        CheckConstraint("status = 'rejected' OR incident_a <> incident_b",
                        name="links_join_two_things"),
    )
    id:          Mapped[int] = mapped_column(Integer, primary_key=True,
                                             autoincrement=True)
    incident_a:  Mapped[str] = mapped_column(String, index=True)
    incident_b:  Mapped[str] = mapped_column(String, index=True)
    kind:        Mapped[str] = mapped_column(String, default="link")  # link|split
    confidence:  Mapped[float] = mapped_column(Float, default=0.0)
    reason:      Mapped[str | None] = mapped_column(Text)
    shared:      Mapped[list] = mapped_column(JSON, default=list)   # what it cited
    gate:        Mapped[dict] = mapped_column(JSON, default=dict)   # checks + result
    status:      Mapped[str] = mapped_column(String, default="proposed", index=True)
    decided_by:  Mapped[str | None] = mapped_column(String)
    decided_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    run_id:      Mapped[str | None] = mapped_column(String)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"
    id:         Mapped[int] = mapped_column(Integer, primary_key=True,
                                            autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                 server_default=func.now())
    kind:     Mapped[str] = mapped_column(String)
    title:    Mapped[str] = mapped_column(String)
    body:     Mapped[str | None] = mapped_column(Text)
    link:     Mapped[str | None] = mapped_column(String)
    for_role: Mapped[str] = mapped_column(String, default="analyst")
    read:     Mapped[bool] = mapped_column(Boolean, default=False)


# ══════════════════════════════════════════════════════════════════════
#  METRICS — serves the chart, sparklines, deltas and donut
# ══════════════════════════════════════════════════════════════════════

class MetricPoint(Base):
    __tablename__ = "metric_points"
    bucket:    Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                primary_key=True)
    metric:    Mapped[str] = mapped_column(String, primary_key=True)
    dimension: Mapped[str] = mapped_column(String, primary_key=True, default="")
    value:     Mapped[int] = mapped_column(Integer, default=0)


class PlaybookUsage(Base):
    __tablename__ = "playbook_usage"
    playbook_id:    Mapped[str] = mapped_column(String, primary_key=True)
    name:           Mapped[str | None] = mapped_column(String)
    matched_count:  Mapped[int] = mapped_column(Integer, default=0)
    executed_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Setting(Base):
    __tablename__ = "settings"
    key:   Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class Run(Base):
    __tablename__ = "runs"
    run_id:     Mapped[str] = mapped_column(String, primary_key=True)
    scenario:   Mapped[dict] = mapped_column(JSON)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                 server_default=func.now())
    ended_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status:     Mapped[str] = mapped_column(String, default="running")
