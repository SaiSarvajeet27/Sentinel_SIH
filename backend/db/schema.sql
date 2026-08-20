-- Sentinel SOC — PostgreSQL reference schema
--
-- The supported setup path is `python scripts/bootstrap.py`, which creates
-- this schema from app/models.py. This file is retained for DBAs who need to
-- provision PostgreSQL manually and must stay in lockstep with those models.

-- ════════════════════════════════════════════════════════════════════
--  ORGANISATION  (the facts everything else depends on)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hosts (
    id           TEXT PRIMARY KEY,          -- WORKSTATION-04
    owner        TEXT,
    department   TEXT,
    criticality  REAL NOT NULL DEFAULT 1.0, -- multiplier used in scoring
    os           TEXT,
    serves       JSONB DEFAULT '[]',        -- shares/services it provides
    coverage     JSONB DEFAULT '[]'         -- ['endpoint','network'] — what we monitor
);

CREATE TABLE IF NOT EXISTS org_users (
    id            TEXT PRIMARY KEY,         -- priya
    full_name     TEXT,
    role_title    TEXT,                     -- "Accounts Officer"
    department    TEXT,
    privilege     REAL NOT NULL DEFAULT 1.0,-- 1 std · 2 admin · 3 domain admin
    primary_host  TEXT REFERENCES hosts(id),
    is_service    BOOLEAN DEFAULT FALSE,
    interactive_login_expected BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS shares (
    path      TEXT PRIMARY KEY,             -- \\FILESERVER-01\shared
    host_id   TEXT REFERENCES hosts(id),
    used_by   JSONB DEFAULT '[]'            -- who loses access if isolated
);

-- ════════════════════════════════════════════════════════════════════
--  PIPELINE
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS events (
    event_id       TEXT PRIMARY KEY,
    ts             TIMESTAMPTZ NOT NULL,
    source         TEXT NOT NULL,           -- endpoint|identity|email|network
    class_name     TEXT NOT NULL,
    actor_user     TEXT,
    src_host       TEXT,
    dst_host       TEXT,
    src_ip         TEXT,
    dst_ip         TEXT,
    process        TEXT,
    parent_process TEXT,
    file_hash      TEXT,
    domain         TEXT,
    outcome        TEXT,
    -- everything an attacker could have chosen, isolated
    untrusted      JSONB NOT NULL DEFAULT '{}',
    raw_ref        TEXT NOT NULL,
    raw_hash       TEXT NOT NULL,           -- sha256 of the original line
    synthetic      BOOLEAN DEFAULT TRUE,
    run_id         TEXT,
    -- Simulation ground truth for /api/benchmark only. Detection rules never
    -- read this field, so it measures recall without becoming circular.
    truth_technique TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts    ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_user  ON events(actor_user);
CREATE INDEX IF NOT EXISTS idx_events_host  ON events(src_host);
CREATE INDEX IF NOT EXISTS idx_events_run   ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_truth ON events(truth_technique);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id     TEXT PRIMARY KEY,
    event_ids    JSONB NOT NULL,
    rule_id      TEXT NOT NULL,
    rule_title   TEXT NOT NULL,
    severity     TEXT NOT NULL,
    technique    TEXT,                      -- T1059.001
    tactic       TEXT,                      -- TA0002
    entities     JSONB NOT NULL DEFAULT '[]',
    detected_at  TIMESTAMPTZ NOT NULL,
    dedupe_count INT DEFAULT 1,
    incident_id  TEXT,
    run_id       TEXT,

    -- Where this came from. 'rule' is a written Sigma rule, 'injection' is
    -- the untrusted-field boundary, 'ai_triage' is the model reviewing what
    -- the rules missed. Constrained here so an AI-raised alert cannot be
    -- laundered into looking like a rule hit.
    origin        TEXT NOT NULL DEFAULT 'rule'
                  CHECK (origin IN ('rule', 'injection', 'ai_triage', 'ai_analysis')),
    ai_confidence REAL,
    ai_reason     TEXT,
    anomalies     JSONB NOT NULL DEFAULT '[]',

    -- Only a written rule may call something critical, because only a rule
    -- can be reviewed before it fires. Enforced by the database, not by a
    -- prompt asking the model nicely.
    CONSTRAINT ai_alerts_capped CHECK (
        origin <> 'ai_triage' OR severity IN ('informational', 'low', 'medium')
    )
);
CREATE INDEX IF NOT EXISTS idx_alerts_incident ON alerts(incident_id);
CREATE INDEX IF NOT EXISTS idx_alerts_rule     ON alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_origin   ON alerts(origin);

CREATE TABLE IF NOT EXISTS incidents (
    incident_id       TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    entity_ids        JSONB NOT NULL DEFAULT '[]',
    first_seen        TIMESTAMPTZ NOT NULL,
    last_seen         TIMESTAMPTZ NOT NULL,
    tactics           JSONB NOT NULL DEFAULT '[]',
    stages            JSONB NOT NULL DEFAULT '[]',  -- 7 booleans, canonical
    risk_score        REAL NOT NULL DEFAULT 0,
    risk_factors      JSONB NOT NULL DEFAULT '{}',
    confidence_band   TEXT,
    confidence_driver TEXT,

    -- The deterministic score, kept whether or not the model ever ran, plus
    -- the movement the model argued for. Bounded by the database as well as
    -- by policy, so "the AI cannot dismiss an incident" is a property of the
    -- schema rather than a claim about the prompt.
    base_score        REAL NOT NULL DEFAULT 0,
    ai_score_delta    REAL NOT NULL DEFAULT 0
                      CHECK (ai_score_delta BETWEEN -10 AND 15),
    ai_score_reason   TEXT,
    ai_score_status   TEXT DEFAULT 'not_run',

    -- The second analyst's own verdict, reached without seeing base_score.
    -- Kept separately because the comparison is the product: two
    -- independent methods agreeing is evidence, two disagreeing is a
    -- finding, and averaging them would destroy both.
    model_score       REAL CHECK (model_score IS NULL
                                  OR model_score BETWEEN 0 AND 100),
    model_band        TEXT,
    model_reasoning   TEXT,
    model_status      TEXT DEFAULT 'not_run',
    agreement         TEXT NOT NULL DEFAULT 'single_path'
                      CHECK (agreement IN ('agreed', 'minor_disagreement',
                                           'disagreement', 'single_path')),
    agreement_detail  JSONB NOT NULL DEFAULT '{}',
    -- Set when the two paths diverge far enough that a person should look,
    -- whatever either score says.
    needs_review      BOOLEAN NOT NULL DEFAULT FALSE,

    -- The model can escalate. It cannot dismiss. Enforced here as well as
    -- in reconcile(), because this is the property the whole design rests
    -- on and it should not depend on one function staying correct.
    CONSTRAINT model_never_lowers CHECK (
        model_score IS NULL OR risk_score >= base_score + ai_score_delta - 0.01
    ),
    narrative         JSONB,                        -- text + citations + meta
    narrative_status  TEXT DEFAULT 'pending',       -- pending|ok|ai_disabled|fallback
    both_sides        JSONB,
    reasoning_steps   JSONB NOT NULL DEFAULT '[]',
    evidence          JSONB NOT NULL DEFAULT '[]',
    limitations       JSONB NOT NULL DEFAULT '[]',
    what_would_change JSONB NOT NULL DEFAULT '[]',
    rationale         TEXT,
    category          TEXT NOT NULL DEFAULT 'security',
    consistency_flag  BOOLEAN DEFAULT FALSE,
    injection_detected BOOLEAN DEFAULT FALSE,
    injection_details JSONB DEFAULT '[]',
    blind_spots       JSONB DEFAULT '[]',
    source_breakdown  JSONB DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'open',
    merged_into       TEXT,
    assigned_to       TEXT,
    run_id            TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_risk   ON incidents(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

-- ══════════════════════════════════════════════════════════════════════
--  CAMPAIGN LINKS  —  what the model thinks the graph missed
--
--  The entity graph connects incidents that share an entity within a
--  weighted hop budget. It cannot connect an attacker who compromises one
--  account, harvests a second, and continues from a machine sharing no edge
--  with the first — there is no edge to walk.
--
--  The model can see that in the shape of the two incidents. So it proposes,
--  a deterministic gate checks the proposal, and a human accepts it. The
--  status column is the record of which of those three happened.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS campaign_links (
    id           SERIAL PRIMARY KEY,
    incident_a   TEXT NOT NULL,
    incident_b   TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'link' CHECK (kind IN ('link', 'split')),
    confidence   REAL NOT NULL DEFAULT 0,
    reason       TEXT,
    shared       JSONB NOT NULL DEFAULT '[]',   -- entities it cited
    gate         JSONB NOT NULL DEFAULT '{}',   -- every check, and the result
    -- proposed = passed the gate, waiting for a person
    -- rejected = failed the gate, never shown as actionable
    -- accepted/declined = a named human decided
    status       TEXT NOT NULL DEFAULT 'proposed'
                 CHECK (status IN ('proposed', 'rejected', 'accepted',
                                   'declined')),
    decided_by   TEXT,
    decided_at   TIMESTAMPTZ,
    run_id       TEXT,
    created_at   TIMESTAMPTZ DEFAULT now(),

    -- A merge cannot be recorded without the person who authorised it.
    CONSTRAINT decided_links_have_an_author CHECK (
        status NOT IN ('accepted', 'declined') OR decided_by IS NOT NULL
    ),
    -- A link that survived the gate must join two different incidents.
    -- Rejected rows are exempt precisely so that "the model proposed
    -- linking an incident to itself" stays on the record.
    CONSTRAINT links_join_two_things CHECK (
        status = 'rejected' OR incident_a <> incident_b
    )
);
CREATE INDEX IF NOT EXISTS idx_links_status ON campaign_links(status);
CREATE INDEX IF NOT EXISTS idx_links_a      ON campaign_links(incident_a);
CREATE INDEX IF NOT EXISTS idx_links_b      ON campaign_links(incident_b);

CREATE TABLE IF NOT EXISTS actions (
    action_id     TEXT PRIMARY KEY,
    incident_id   TEXT NOT NULL REFERENCES incidents(incident_id),
    kind          TEXT NOT NULL,
    target        TEXT NOT NULL,
    tier          INT  NOT NULL,
    blast_radius  JSONB NOT NULL DEFAULT '{}',
    rollback      JSONB,                    -- null only for tier 2/3
    rollback_expires_at TIMESTAMPTZ,
    rationale     TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by   JSONB DEFAULT '[]',       -- tier 3 needs two entries
    approval_reason TEXT,
    escalated_to  TEXT,
    override_of   TEXT,                     -- set when chosen instead of X
    executed_at   TIMESTAMPTZ,
    result        JSONB,
    CONSTRAINT reversible_if_auto
        CHECK (tier > 1 OR rollback IS NOT NULL)   -- enforced in the database
);
CREATE INDEX IF NOT EXISTS idx_actions_status   ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_incident ON actions(incident_id);

-- ════════════════════════════════════════════════════════════════════
--  GOVERNANCE
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ledger (
    seq          BIGSERIAL PRIMARY KEY,
    ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor        TEXT NOT NULL,
    action_type  TEXT NOT NULL,
    payload      JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    prev_hash    TEXT NOT NULL,
    entry_hash   TEXT NOT NULL,
    signature    TEXT NOT NULL
);

-- The ledger is append-only. Enforce it rather than trusting the code.
CREATE OR REPLACE FUNCTION ledger_is_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON ledger;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger
    FOR EACH ROW EXECUTE FUNCTION ledger_is_immutable();

CREATE TABLE IF NOT EXISTS app_users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    full_name     TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'analyst',
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rules (
    rule_id     TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    technique   TEXT,
    enabled     BOOLEAN DEFAULT TRUE,
    protected   BOOLEAN DEFAULT FALSE,   -- unfilterable floor
    fired_count INT DEFAULT 0,
    fp_count    INT DEFAULT 0,
    proposed_for_retirement BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS feedback (
    id          BIGSERIAL PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
    analyst     TEXT NOT NULL,
    verdict     TEXT NOT NULL,           -- tp|fp|needs_review
    reason_code TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS overrides (
    id                  BIGSERIAL PRIMARY KEY,
    action_id           TEXT NOT NULL,
    incident_id         TEXT NOT NULL,
    recommended_action  TEXT NOT NULL,
    chosen_action       TEXT NOT NULL,
    reason              TEXT,
    analyst             TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id         BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    kind       TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT,
    link       TEXT,
    for_role   TEXT DEFAULT 'analyst',
    read       BOOLEAN DEFAULT FALSE
);

-- ════════════════════════════════════════════════════════════════════
--  METRICS  (serves the chart, sparklines, deltas and donut)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS metric_points (
    bucket    TIMESTAMPTZ NOT NULL,
    metric    TEXT NOT NULL,           -- events|alerts|incidents|injections
    dimension TEXT NOT NULL DEFAULT '',-- optional: source, severity
    value     INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, metric, dimension)
);

CREATE TABLE IF NOT EXISTS playbook_usage (
    playbook_id    TEXT PRIMARY KEY,
    name           TEXT,
    matched_count  INT DEFAULT 0,
    executed_count INT DEFAULT 0,
    last_used      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
    run_id     TEXT PRIMARY KEY,
    scenario   JSONB NOT NULL,
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at   TIMESTAMPTZ,
    status     TEXT DEFAULT 'running'
);
