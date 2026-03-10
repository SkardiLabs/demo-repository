-- ============================================================
-- Expense Reimbursement Demo — MySQL seed script
-- Database: expense_db
-- Run: docker exec -i <container> mysql -u root -p expense_db < init_mysql.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS expense_db;
USE expense_db;

-- ── vendors ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id          VARCHAR(20)    NOT NULL PRIMARY KEY,
    vendor_name        VARCHAR(200)   NOT NULL,
    is_approved        TINYINT(1)     NOT NULL DEFAULT 0,
    avg_invoice_amount DECIMAL(10, 2),
    category           VARCHAR(100)
);

INSERT INTO vendors (vendor_id, vendor_name, is_approved, avg_invoice_amount, category) VALUES
    ('V001', 'Acme Office Supplies',    1,  95.00,  'Office Supplies'),
    ('V002', 'Global Travel Partners',  1, 380.00,  'Travel'),
    ('V003', 'TechSolutions Inc',       1, 240.00,  'Software & Subscriptions'),
    ('V004', 'Fine Dining Co',          1,  80.00,  'Meals & Entertainment'),
    ('V005', 'CloudHost Pro',           1, 190.00,  'Software & Subscriptions'),
    ('V006', 'Unknown Supplies LLC',    0,   NULL,   NULL),
    ('V007', 'Sketchy Gadgets',         0,   NULL,   NULL);

-- ── claims ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
    claim_id     VARCHAR(20)    NOT NULL PRIMARY KEY,
    employee_id  VARCHAR(20)    NOT NULL,
    amount       DECIMAL(10, 2) NOT NULL,
    category     VARCHAR(100)   NOT NULL,
    vendor_name  VARCHAR(200)   NOT NULL,
    expense_date DATE           NOT NULL,
    description  TEXT,
    receipt_url  VARCHAR(500),
    status       VARCHAR(50)    NOT NULL DEFAULT 'SUBMITTED',
    anomaly_score DECIMAL(5, 4),
    submitted_at TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO claims
    (claim_id, employee_id, amount, category, vendor_name, expense_date, description, receipt_url, status, anomaly_score, submitted_at)
VALUES
    -- ── already scored, low risk → PENDING_L1
    ('C001', 'E001',  95.00, 'Office Supplies',          'Acme Office Supplies',   '2026-02-15', 'Printer cartridges for Q1 budget',    'https://receipts/C001.pdf', 'PENDING_L1',     0.0000, '2026-02-15 09:12:00'),
    ('C002', 'E002', 420.00, 'Travel',                   'Global Travel Partners', '2026-02-10', 'Flight — Chicago client visit',        'https://receipts/C002.pdf', 'PENDING_L1',     0.2500, '2026-02-10 14:33:00'),
    ('C003', 'E003', 220.00, 'Software & Subscriptions', 'TechSolutions Inc',      '2026-02-20', 'Annual dev tools license',             'https://receipts/C003.pdf', 'PENDING_L1',     0.0000, '2026-02-20 10:05:00'),
    -- ── already scored, high risk → PENDING_AUDITOR
    ('C004', 'E001', 195.00, 'Meals & Entertainment',    'Unknown Supplies LLC',   '2026-02-22', 'Team lunch (vendor not in registry)',   'https://receipts/C004.pdf', 'PENDING_AUDITOR', 0.5500, '2026-02-22 12:44:00'),
    ('C005', 'E004', 680.00, 'Travel',                   'Sketchy Gadgets',        '2026-02-25', 'Conference trip — amount exceeds limit','https://receipts/C005.pdf', 'PENDING_AUDITOR', 0.5000, '2026-02-25 08:20:00'),
    -- ── freshly submitted, not yet scored
    ('C006', 'E002',  75.00, 'Meals & Entertainment',    'Fine Dining Co',         '2026-03-01', 'Client dinner',                        'https://receipts/C006.pdf', 'SUBMITTED',       NULL,   '2026-03-01 19:10:00'),
    ('C007', 'E003', 310.00, 'Software & Subscriptions', 'Unknown Supplies LLC',   '2026-03-03', 'New SaaS tool (vendor unverified)',     'https://receipts/C007.pdf', 'SUBMITTED',       NULL,   '2026-03-03 11:30:00');

-- ── approval_records ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_records (
    record_id     VARCHAR(20)  NOT NULL PRIMARY KEY,
    claim_id      VARCHAR(20)  NOT NULL,
    approver_id   VARCHAR(20)  NOT NULL,
    decision      VARCHAR(20)  NOT NULL,   -- APPROVE | REJECT
    comment       TEXT,
    approval_tier VARCHAR(20)  NOT NULL,   -- L1 | AUDITOR | FINANCE
    decided_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- (empty — decisions are recorded via approve_or_reject_claim pipeline)
