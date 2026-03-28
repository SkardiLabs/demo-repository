-- ============================================================
-- Expense Reimbursement Demo — Supabase / PostgreSQL seed
-- Run via Supabase CLI:
--   supabase db reset        (applies all migrations)
-- Or directly:
--   psql "$DATABASE_URL" -f init_supabase.sql
-- Or in Supabase Studio → SQL editor.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id          TEXT           NOT NULL PRIMARY KEY,
    vendor_name        TEXT           NOT NULL,
    is_approved        INT            NOT NULL DEFAULT 0,
    avg_invoice_amount NUMERIC(10,2),
    category           TEXT
);

CREATE TABLE IF NOT EXISTS claims (
    claim_id      TEXT           NOT NULL PRIMARY KEY,
    employee_id   TEXT           NOT NULL,
    amount        NUMERIC(10,2)  NOT NULL,
    category      TEXT           NOT NULL,
    vendor_name   TEXT           NOT NULL,
    expense_date  DATE           NOT NULL,
    description   TEXT,
    receipt_url   TEXT,
    status        TEXT           NOT NULL DEFAULT 'SUBMITTED',
    anomaly_score NUMERIC(5,4),
    submitted_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_records (
    record_id     TEXT         NOT NULL PRIMARY KEY,
    claim_id      TEXT         NOT NULL REFERENCES claims(claim_id),
    approver_id   TEXT         NOT NULL,
    decision      TEXT         NOT NULL,   -- APPROVE | REJECT
    comment       TEXT,
    approval_tier TEXT         NOT NULL,   -- L1 | AUDITOR | FINANCE
    decided_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Replaces MongoDB policies collection — now a plain PostgreSQL table
CREATE TABLE IF NOT EXISTS policies (
    category         TEXT           NOT NULL PRIMARY KEY,
    per_claim_limit  NUMERIC(10,2)  NOT NULL,
    monthly_limit    NUMERIC(10,2)  NOT NULL,
    requires_receipt BOOLEAN        NOT NULL DEFAULT true,
    notes            TEXT
);

-- Replaces Lance file — 8-dimensional claim embeddings stored via pgvector
CREATE TABLE IF NOT EXISTS claim_embeddings (
    claim_id  TEXT      NOT NULL PRIMARY KEY,
    embedding vector(8) NOT NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────

-- Speed up the common queue query patterns
CREATE INDEX IF NOT EXISTS idx_claims_status           ON claims (status);
CREATE INDEX IF NOT EXISTS idx_claims_employee         ON claims (employee_id);
CREATE INDEX IF NOT EXISTS idx_claims_submitted_at     ON claims (submitted_at);
CREATE INDEX IF NOT EXISTS idx_approval_records_claim  ON approval_records (claim_id);

-- pgvector index for cosine similarity KNN (HNSW — fast at scale)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
    ON claim_embeddings USING hnsw (embedding vector_cosine_ops);

-- ── Seed: vendors ─────────────────────────────────────────────────────────

INSERT INTO vendors (vendor_id, vendor_name, is_approved, avg_invoice_amount, category) VALUES
    ('V001', 'Acme Office Supplies',    1,  95.00, 'Office Supplies'),
    ('V002', 'Global Travel Partners',  1, 380.00, 'Travel'),
    ('V003', 'TechSolutions Inc',       1, 240.00, 'Software & Subscriptions'),
    ('V004', 'Fine Dining Co',          1,  80.00, 'Meals & Entertainment'),
    ('V005', 'CloudHost Pro',           1, 190.00, 'Software & Subscriptions'),
    ('V006', 'Unknown Supplies LLC',    0,   NULL,  NULL),
    ('V007', 'Sketchy Gadgets',         0,   NULL,  NULL)
ON CONFLICT (vendor_id) DO NOTHING;

-- ── Seed: claims ──────────────────────────────────────────────────────────

INSERT INTO claims
    (claim_id, employee_id, amount, category, vendor_name, expense_date,
     description, receipt_url, status, anomaly_score, submitted_at)
VALUES
    -- low risk → PENDING_L1
    ('C001', 'E001',  95.00, 'Office Supplies',          'Acme Office Supplies',   '2026-02-15',
     'Printer cartridges for Q1 budget',        'https://receipts/C001.pdf', 'PENDING_L1',     0.0000, '2026-02-15 09:12:00+00'),
    ('C002', 'E002', 420.00, 'Travel',                   'Global Travel Partners', '2026-02-10',
     'Flight — Chicago client visit',           'https://receipts/C002.pdf', 'PENDING_L1',     0.2500, '2026-02-10 14:33:00+00'),
    ('C003', 'E003', 220.00, 'Software & Subscriptions', 'TechSolutions Inc',      '2026-02-20',
     'Annual dev tools license',                'https://receipts/C003.pdf', 'PENDING_L1',     0.0000, '2026-02-20 10:05:00+00'),
    -- high risk → PENDING_AUDITOR
    ('C004', 'E001', 195.00, 'Meals & Entertainment',    'Unknown Supplies LLC',   '2026-02-22',
     'Team lunch (vendor not in registry)',     'https://receipts/C004.pdf', 'PENDING_AUDITOR', 0.5500, '2026-02-22 12:44:00+00'),
    ('C005', 'E004', 680.00, 'Travel',                   'Sketchy Gadgets',        '2026-02-25',
     'Conference trip — amount exceeds limit', 'https://receipts/C005.pdf', 'PENDING_AUDITOR', 0.5000, '2026-02-25 08:20:00+00'),
    -- freshly submitted, not yet scored
    ('C006', 'E002',  75.00, 'Meals & Entertainment',    'Fine Dining Co',         '2026-03-01',
     'Client dinner',                           'https://receipts/C006.pdf', 'SUBMITTED',       NULL,   '2026-03-01 19:10:00+00'),
    ('C007', 'E003', 310.00, 'Software & Subscriptions', 'Unknown Supplies LLC',   '2026-03-03',
     'New SaaS tool (vendor unverified)',       'https://receipts/C007.pdf', 'SUBMITTED',       NULL,   '2026-03-03 11:30:00+00')
ON CONFLICT (claim_id) DO NOTHING;

-- ── Seed: policies (replaces MongoDB seed_mongo.js) ───────────────────────

INSERT INTO policies (category, per_claim_limit, monthly_limit, requires_receipt, notes) VALUES
    ('Travel',                   500.00, 2000.00, true,
     'Includes flights, hotels, car rental. International travel needs pre-approval.'),
    ('Meals & Entertainment',    200.00,  800.00, true,
     'Business purpose and attendee list required for amounts over $50.'),
    ('Office Supplies',          100.00,  500.00, false,
     'Amounts under $25 require no receipt.'),
    ('Software & Subscriptions', 300.00, 1000.00, true,
     'Annual subscriptions must be approved by department head.'),
    ('Training & Education',    1000.00, 3000.00, true,
     'Course, conference, and certification fees. Manager pre-approval required.')
ON CONFLICT (category) DO NOTHING;

-- ── Seed: claim_embeddings (replaces Lance create_lance_dataset.py) ────────
--
-- Embeddings mirror create_lance_dataset.py (rng seed=42) and the in-memory
-- vectors in backend/src/services/similarity-service.ts.
-- Four semantic clusters; perturbed copies simulate related claims.
--
-- Cluster A: Office Supplies  B: Travel  C: Software  D: Meals
--
-- Ghost entries C100–C104 are historical claims stored only in the embeddings
-- table (not in claims) to provide richer KNN context, matching the Lance demo.

INSERT INTO claim_embeddings (claim_id, embedding) VALUES
    ('C001', '[0.4588,0.5137,0.2910,0.3842,0.1734,0.4021,0.2943,0.1712]'),
    ('C002', '[0.2156,0.3401,0.5782,0.1034,0.4891,0.3217,0.1982,0.4602]'),
    ('C003', '[0.3890,0.1023,0.2341,0.5619,0.2078,0.5012,0.3841,0.3291]'),
    ('C004', '[0.1240,0.4502,0.1893,0.2034,0.5921,0.2310,0.4782,0.3109]'),
    ('C005', '[0.2147,0.3152,0.5484,0.0891,0.4757,0.3035,0.1842,0.4399]'),
    ('C006', '[0.1239,0.4487,0.1822,0.2079,0.5843,0.2252,0.4743,0.2999]'),
    ('C007', '[0.3647,0.1017,0.2355,0.5341,0.2065,0.4950,0.3561,0.3188]'),
    -- historical ghost embeddings (C100-C104 not in claims table)
    ('C100', '[0.4680,0.4983,0.3092,0.3653,0.1761,0.4123,0.2653,0.1798]'),
    ('C101', '[0.4393,0.5318,0.2603,0.3901,0.1924,0.3764,0.2947,0.1981]'),
    ('C102', '[0.2161,0.3305,0.5346,0.1134,0.4636,0.3177,0.2090,0.4311]'),
    ('C103', '[0.3720,0.0764,0.2332,0.5541,0.1821,0.4773,0.3543,0.3288]'),
    ('C104', '[0.1131,0.4487,0.1891,0.1883,0.5913,0.2331,0.4644,0.3088]')
ON CONFLICT (claim_id) DO NOTHING;

-- ── PostgreSQL Functions (called via supabase.rpc()) ──────────────────────

-- find_similar_claims: pgvector KNN search by cosine distance
-- Replaces in-memory brute-force cosine loop in similarity-service.ts
CREATE OR REPLACE FUNCTION find_similar_claims(
    p_claim_id TEXT,
    p_k        INT DEFAULT 5
)
RETURNS TABLE(claim_id TEXT, similarity_distance FLOAT8)
LANGUAGE SQL STABLE AS $$
    SELECT e2.claim_id,
           (e1.embedding <=> e2.embedding)::FLOAT8 AS similarity_distance
    FROM   claim_embeddings e1,
           claim_embeddings e2
    WHERE  e1.claim_id = p_claim_id
      AND  e2.claim_id != p_claim_id
    ORDER  BY similarity_distance
    LIMIT  p_k;
$$;

-- get_claim_context: join claims + vendors + policies in one query
-- Replaces 3 sequential DB calls in ScoringService.getClaimContext()
CREATE OR REPLACE FUNCTION get_claim_context(p_claim_id TEXT)
RETURNS TABLE(
    claim_id              TEXT,
    employee_id           TEXT,
    amount                NUMERIC,
    category              TEXT,
    vendor_name           TEXT,
    expense_date          DATE,
    description           TEXT,
    receipt_url           TEXT,
    status                TEXT,
    anomaly_score         NUMERIC,
    submitted_at          TIMESTAMPTZ,
    vendor_is_approved    INT,
    vendor_avg_invoice    NUMERIC,
    policy_per_claim_limit NUMERIC,
    policy_monthly_limit  NUMERIC,
    policy_requires_receipt BOOLEAN
)
LANGUAGE SQL STABLE AS $$
    SELECT
        c.claim_id,
        c.employee_id,
        c.amount,
        c.category,
        c.vendor_name,
        c.expense_date,
        c.description,
        c.receipt_url,
        c.status,
        c.anomaly_score,
        c.submitted_at,
        COALESCE(v.is_approved, 0)              AS vendor_is_approved,
        v.avg_invoice_amount                    AS vendor_avg_invoice,
        COALESCE(p.per_claim_limit,  1000.0)    AS policy_per_claim_limit,
        COALESCE(p.monthly_limit,    5000.0)    AS policy_monthly_limit,
        COALESCE(p.requires_receipt, true)      AS policy_requires_receipt
    FROM  claims c
    LEFT  JOIN vendors  v ON v.vendor_name = c.vendor_name
    LEFT  JOIN policies p ON p.category    = c.category
    WHERE c.claim_id = p_claim_id;
$$;

-- score_claim: compute anomaly score in a single CTE query
-- Replaces 4 separate DB calls + TypeScript formula in ScoringService.scoreClaim()
CREATE OR REPLACE FUNCTION score_claim(p_claim_id TEXT)
RETURNS TABLE(
    claim_id                   TEXT,
    employee_id                TEXT,
    amount                     NUMERIC,
    category                   TEXT,
    vendor_name                TEXT,
    expense_date               DATE,
    is_approved_vendor         INT,
    vendor_avg_amount          NUMERIC,
    policy_limit               NUMERIC,
    prior_claims_same_category BIGINT,
    anomaly_score              NUMERIC,
    routing_decision           TEXT
)
LANGUAGE SQL STABLE AS $$
    WITH
        claim AS (
            SELECT * FROM claims WHERE claim_id = p_claim_id
        ),
        prior AS (
            SELECT COUNT(*) AS cnt
            FROM   claims cls, claim c
            WHERE  cls.employee_id = c.employee_id
              AND  cls.category    = c.category
              AND  cls.claim_id   != p_claim_id
        )
    SELECT
        c.claim_id,
        c.employee_id,
        c.amount,
        c.category,
        c.vendor_name,
        c.expense_date,
        COALESCE(v.is_approved, 0)::INT           AS is_approved_vendor,
        COALESCE(v.avg_invoice_amount, 0)         AS vendor_avg_amount,
        COALESCE(p.per_claim_limit, 1000.0)       AS policy_limit,
        pr.cnt                                    AS prior_claims_same_category,
        ROUND((
            CASE WHEN COALESCE(v.is_approved, 0) = 0 THEN 0.25 ELSE 0 END
          + CASE WHEN COALESCE(v.avg_invoice_amount, 0) > 0
                  AND c.amount > v.avg_invoice_amount * 2 THEN 0.30 ELSE 0 END
          + CASE WHEN pr.cnt > 10                         THEN 0.20 ELSE 0 END
          + CASE WHEN c.amount > COALESCE(p.per_claim_limit, 1000.0)
                                                          THEN 0.25 ELSE 0 END
        )::NUMERIC, 4)                            AS anomaly_score,
        CASE WHEN (
            CASE WHEN COALESCE(v.is_approved, 0) = 0 THEN 0.25 ELSE 0 END
          + CASE WHEN COALESCE(v.avg_invoice_amount, 0) > 0
                  AND c.amount > v.avg_invoice_amount * 2 THEN 0.30 ELSE 0 END
          + CASE WHEN pr.cnt > 10                         THEN 0.20 ELSE 0 END
          + CASE WHEN c.amount > COALESCE(p.per_claim_limit, 1000.0)
                                                          THEN 0.25 ELSE 0 END
        ) >= 0.40 THEN 'ELEVATED_REVIEW' ELSE 'STANDARD_REVIEW' END
                                                  AS routing_decision
    FROM  claim c
    CROSS JOIN prior pr
    LEFT  JOIN vendors  v ON v.vendor_name = c.vendor_name
    LEFT  JOIN policies p ON p.category    = c.category;
$$;

-- enrich_queue: full approver-queue enrichment in ONE CTE query with pgvector LATERAL join
-- Replaces 4 MySQL + K MongoDB + N Lance round-trips in QueueEnrichmentService.enrichQueue()
--
-- Query count: 1   (vs 4+K_categories+N_claims in the traditional backend)
CREATE OR REPLACE FUNCTION enrich_queue(p_status TEXT)
RETURNS TABLE(
    claim_id                   TEXT,
    employee_id                TEXT,
    amount                     NUMERIC,
    category                   TEXT,
    vendor_name                TEXT,
    expense_date               DATE,
    description                TEXT,
    receipt_url                TEXT,
    status                     TEXT,
    anomaly_score              NUMERIC,
    submitted_at               TIMESTAMPTZ,
    budget_headroom            NUMERIC,
    vendor_rejection_rate      NUMERIC,
    employee_risk_ratio        NUMERIC,
    policy_monthly_limit       NUMERIC,
    nearest_duplicate_id       TEXT,
    nearest_duplicate_distance FLOAT8
)
LANGUAGE SQL STABLE AS $$
    WITH
        -- Month-to-date non-rejected spend per category
        -- (aggregated directly from claims — not via approval_records, which
        --  would double-count claims with multiple approval events)
        budget_usage AS (
            SELECT   category,
                     COALESCE(SUM(amount), 0) AS spent_this_month
            FROM     claims
            WHERE    status != 'REJECTED'
              AND    submitted_at >= date_trunc('month', NOW())
            GROUP BY category
        ),
        -- Historical rejection rate per vendor
        vendor_risk AS (
            SELECT   c.vendor_name,
                     ROUND(AVG(CASE WHEN ar.decision = 'REJECT'
                                    THEN 1.0 ELSE 0.0 END)::NUMERIC, 4)
                         AS rejection_rate
            FROM     claims c
            LEFT     JOIN approval_records ar ON ar.claim_id = c.claim_id
            GROUP BY c.vendor_name
        ),
        -- Fraction of high-anomaly (> 0.4) claims per submitter
        employee_risk AS (
            SELECT   employee_id,
                     ROUND(AVG(CASE WHEN anomaly_score > 0.4
                                    THEN 1.0 ELSE 0.0 END)::NUMERIC, 4)
                         AS risk_ratio
            FROM     claims
            GROUP BY employee_id
        )
    SELECT
        c.claim_id,
        c.employee_id,
        c.amount,
        c.category,
        c.vendor_name,
        c.expense_date,
        c.description,
        c.receipt_url,
        c.status,
        c.anomaly_score,
        c.submitted_at,
        ROUND(COALESCE(
            p.monthly_limit - bu.spent_this_month,
            p.monthly_limit,
            5000.0
        )::NUMERIC, 2)                          AS budget_headroom,
        COALESCE(vr.rejection_rate, 0)          AS vendor_rejection_rate,
        COALESCE(er.risk_ratio, 0)              AS employee_risk_ratio,
        COALESCE(p.monthly_limit, 5000.0)       AS policy_monthly_limit,
        sim.nearest_id                          AS nearest_duplicate_id,
        sim.nearest_dist                        AS nearest_duplicate_distance
    FROM  claims c
    LEFT  JOIN policies      p  ON p.category     = c.category
    LEFT  JOIN budget_usage  bu ON bu.category    = c.category
    LEFT  JOIN vendor_risk   vr ON vr.vendor_name = c.vendor_name
    LEFT  JOIN employee_risk er ON er.employee_id = c.employee_id
    -- pgvector LATERAL: one KNN lookup per claim, all in the same query plan
    LEFT  JOIN LATERAL (
        SELECT  e2.claim_id                              AS nearest_id,
                (e1.embedding <=> e2.embedding)::FLOAT8  AS nearest_dist
        FROM    claim_embeddings e1,
                claim_embeddings e2
        WHERE   e1.claim_id = c.claim_id
          AND   e2.claim_id != c.claim_id
        ORDER   BY nearest_dist
        LIMIT   1
    ) sim ON true
    WHERE c.status = p_status
    ORDER BY c.anomaly_score DESC NULLS LAST, c.submitted_at ASC;
$$;
