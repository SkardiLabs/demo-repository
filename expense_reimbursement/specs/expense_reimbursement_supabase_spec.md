# Intelligent Expense Audit & Anomaly Detection — Supabase Backend Specification

## Overview

A Supabase-powered intelligent expense audit system that consolidates all data stores into a single PostgreSQL database and expresses complex cross-table logic as PostgreSQL functions — delivering Skardi-level query efficiency from a conventional TypeScript/Express backend.

The system supports the full lifecycle of expense claims: submission, anomaly scoring, approval routing, and queue enrichment. Everything runs in one Supabase project: the relational tables, policy documents, and vector embeddings live together in PostgreSQL, joined and searched in a single SQL query per operation.

---

## Why Supabase

Traditional implementation scatters data across three independent stores:

| Data | Traditional Store | Problem |
|---|---|---|
| Claims, vendors, approvals | MySQL | Requires mysql2 driver and separate connection pool |
| Policy rules | MongoDB | Requires separate driver; no native SQL joins to relational data |
| Claim embeddings | Lance (file) | Requires Python toolchain; file-based, not queryable with SQL |

With Supabase:
- All three stores collapse into **one PostgreSQL database** with pgvector
- Policy data is a regular table — SQL `JOIN` works natively
- Vector similarity is a native `<=>` operator — embeddable in CTEs and LATERAL joins
- Complex multi-source queries become **PostgreSQL functions** called via `supabase.rpc()`
- One `@supabase/supabase-js` client replaces `mysql2 + mongodb + lance` drivers
- Queue enrichment is **1 SQL query** (same count as Skardi), not 4+K+N round-trips

---

## Architecture

```
                      ┌──────────────────┐
                      │  React Frontend  │
                      └────────┬─────────┘
                               │  /supa/*
                      ┌────────▼─────────┐
                      │  Express Backend  │   Port 8083
                      │  (TypeScript)     │
                      └────────┬─────────┘
                               │  @supabase/supabase-js
                      ┌────────▼─────────┐
                      │    Supabase      │
                      │  ┌─────────────┐ │
                      │  │  PostgreSQL  │ │   claims, vendors, approval_records,
                      │  │  + pgvector  │ │   policies, claim_embeddings
                      │  └─────────────┘ │
                      │  ┌─────────────┐ │
                      │  │  PostgREST  │ │   Auto-generated REST + RPC layer
                      │  └─────────────┘ │
                      └──────────────────┘
```

---

## Data Model

All data lives in one PostgreSQL schema. pgvector is enabled as an extension.

### Tables

```sql
-- Replaces MySQL: claims table
claims (
  claim_id      TEXT PRIMARY KEY,
  employee_id   TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  category      TEXT NOT NULL,
  vendor_name   TEXT NOT NULL,
  expense_date  DATE NOT NULL,
  description   TEXT,
  receipt_url   TEXT,
  status        TEXT NOT NULL DEFAULT 'SUBMITTED',
  anomaly_score NUMERIC(5,4),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Replaces MySQL: vendors table
vendors (
  vendor_id          TEXT PRIMARY KEY,
  vendor_name        TEXT NOT NULL,
  is_approved        INT NOT NULL DEFAULT 0,
  avg_invoice_amount NUMERIC(10,2),
  category           TEXT
)

-- Replaces MySQL: approval_records table
approval_records (
  record_id     TEXT PRIMARY KEY,
  claim_id      TEXT NOT NULL REFERENCES claims(claim_id),
  approver_id   TEXT NOT NULL,
  decision      TEXT NOT NULL,   -- APPROVE | REJECT
  comment       TEXT,
  approval_tier TEXT NOT NULL,   -- L1 | AUDITOR | FINANCE
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Replaces MongoDB: policy documents become a regular table
policies (
  category         TEXT PRIMARY KEY,
  per_claim_limit  NUMERIC(10,2) NOT NULL,
  monthly_limit    NUMERIC(10,2) NOT NULL,
  requires_receipt BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT
)

-- Replaces Lance: 8-dimensional embeddings stored as pgvector column
claim_embeddings (
  claim_id  TEXT PRIMARY KEY,
  embedding vector(8) NOT NULL
)
```

### PostgreSQL Functions (RPC Endpoints)

Complex multi-table operations are expressed as PostgreSQL functions and called via `supabase.rpc()`. Each function is a single SQL statement.

| Function | Inputs | Replaces |
|---|---|---|
| `enrich_queue(p_status)` | status string | 4 MySQL + K MongoDB + N Lance round-trips |
| `get_claim_context(p_claim_id)` | claim ID | 3 separate DB calls (claim + vendor + policy) |
| `score_claim(p_claim_id)` | claim ID | 4 DB calls + TypeScript scoring formula |
| `find_similar_claims(p_claim_id, p_k)` | claim ID, result count | In-memory cosine distance loop |

---

## Roles

| Role | Description |
|---|---|
| **Employee (Claimant)** | Submits claims; sees own claim history |
| **L1 Approver** | Reviews standard-risk pending claims; sees anomaly score, vendor risk, employee risk, and duplicate suggestions |
| **Senior Auditor (L2 Approver)** | Handles elevated-risk claims (anomaly_score ≥ 0.4) |
| **System Admin** | Manages policy limits; can update the `policies` table directly in Supabase Studio |

---

## Claim Lifecycle

```
SUBMITTED → PENDING_L1      (anomaly_score < 0.4)
         → PENDING_AUDITOR  (anomaly_score ≥ 0.4)
         → APPROVED
         → REJECTED (with comment)
```

---

## PostgreSQL Functions

### `enrich_queue(p_status TEXT)`

Full approver-queue enrichment in a **single CTE query** with pgvector LATERAL join.

**Logic:**
```sql
WITH
  budget_usage AS (
    SELECT category, COALESCE(SUM(amount), 0) AS spent_this_month
    FROM   claims
    WHERE  status != 'REJECTED'
      AND  submitted_at >= date_trunc('month', NOW())
    GROUP  BY category
  ),
  vendor_risk AS (
    SELECT c.vendor_name,
           ROUND(AVG(CASE WHEN ar.decision='REJECT' THEN 1.0 ELSE 0.0 END)::numeric, 4)
             AS rejection_rate
    FROM   claims c
    LEFT   JOIN approval_records ar ON ar.claim_id = c.claim_id
    GROUP  BY c.vendor_name
  ),
  employee_risk AS (
    SELECT employee_id,
           ROUND(AVG(CASE WHEN anomaly_score > 0.4 THEN 1.0 ELSE 0.0 END)::numeric, 4)
             AS risk_ratio
    FROM   claims
    GROUP  BY employee_id
  )
SELECT c.*, ... budget_headroom, vendor_rejection_rate, employee_risk_ratio,
       policy_monthly_limit,
       sim.nearest_id AS nearest_duplicate_id,
       sim.nearest_dist AS nearest_duplicate_distance
FROM   claims c
LEFT   JOIN policies p       ON p.category    = c.category
LEFT   JOIN budget_usage bu  ON bu.category   = c.category
LEFT   JOIN vendor_risk vr   ON vr.vendor_name = c.vendor_name
LEFT   JOIN employee_risk er ON er.employee_id = c.employee_id
LEFT   JOIN LATERAL (
         SELECT e2.claim_id AS nearest_id,
                (e1.embedding <=> e2.embedding)::float8 AS nearest_dist
         FROM   claim_embeddings e1, claim_embeddings e2
         WHERE  e1.claim_id = c.claim_id AND e2.claim_id != c.claim_id
         ORDER  BY nearest_dist LIMIT 1
       ) sim ON true
WHERE  c.status = p_status
ORDER  BY c.anomaly_score DESC NULLS LAST, c.submitted_at ASC
```

**Query count: 1** (same as Skardi). Traditional backend requires 4 + K_categories + N_claims.

---

### `get_claim_context(p_claim_id TEXT)`

Single LEFT JOIN across `claims`, `vendors`, and `policies`. Replaces 3 sequential DB calls in the traditional backend.

---

### `score_claim(p_claim_id TEXT)`

Single CTE query: fetches claim, vendor, policy, prior-claim count, and applies the scoring formula entirely in SQL.

**Scoring formula (identical to score_claim.yaml in Skardi):**
- +0.25 if vendor not in approved registry
- +0.30 if claim amount > 2× vendor's typical invoice amount
- +0.20 if employee has > 10 prior claims in same category
- +0.25 if claim amount exceeds policy per-claim limit
- Score ≥ 0.40 → `ELEVATED_REVIEW`, otherwise `STANDARD_REVIEW`

---

### `find_similar_claims(p_claim_id TEXT, p_k INT)`

pgvector KNN search using cosine distance (`<=>`):
```sql
SELECT e2.claim_id, (e1.embedding <=> e2.embedding)::float8 AS similarity_distance
FROM   claim_embeddings e1, claim_embeddings e2
WHERE  e1.claim_id = p_claim_id AND e2.claim_id != p_claim_id
ORDER  BY similarity_distance LIMIT p_k
```

Replaces brute-force in-memory cosine loop in the traditional backend. For large corpora, pgvector's HNSW or IVF-PQ index makes this dramatically faster.

---

## Backend API (Port 8083)

Same REST surface as the traditional backend. All routes call `supabase.rpc()` or `supabase.from()`.

| Method | Path | Calls |
|---|---|---|
| `POST` | `/claims` | `supabase.from('claims').insert()` |
| `GET` | `/claims?status=X` | `supabase.from('claims').select().eq('status', X)` |
| `GET` | `/claims?employee_id=X` | `supabase.from('claims').select().eq('employee_id', X)` |
| `GET` | `/claims/:id` | `supabase.rpc('get_claim_context', { p_claim_id })` |
| `GET` | `/claims/:id/score` | `supabase.rpc('score_claim', { p_claim_id })` |
| `GET` | `/claims/:id/similar` | `supabase.rpc('find_similar_claims', { p_claim_id, p_k })` |
| `POST` | `/approvals` | `supabase.from('approval_records').insert()` |
| `GET` | `/queue?status=X` | `supabase.rpc('enrich_queue', { p_status })` — **1 query** |
| `GET` | `/health` | — |

---

## Anomaly Score

Computed on demand by `score_claim()` and stored on the claim row via `UPDATE claims SET anomaly_score = ..., status = ... WHERE claim_id = ...`. Claims with `anomaly_score ≥ 0.4` are routed to PENDING_AUDITOR.

---

## Business Rules

1. A claim cannot be approved by the same person who submitted it.
2. Claims with high pgvector similarity to existing claims are surfaced as potential duplicates; approvers see `nearest_duplicate_id` and `nearest_duplicate_distance` in the enriched queue.
3. `budget_headroom` is computed at query time from non-rejected month-to-date spend; no materialized budget table is maintained.

---

## Environment Variables

| Variable | Default (Supabase CLI local) | Description |
|---|---|---|
| `SUPABASE_URL` | `http://localhost:54321` | Supabase project URL |
| `SUPABASE_ANON_KEY` | *(local dev key)* | Public anon key from project settings |
| `PORT` | `8083` | Express listen port |

---

## Infrastructure Comparison

| Concern | Traditional | Supabase | Skardi |
|---|---|---|---|
| **Data stores** | MySQL + MongoDB + Lance | Supabase PostgreSQL + pgvector | MySQL + MongoDB + Lance |
| **Backend** | Express + mysql2 + mongodb | Express + @supabase/supabase-js | None (YAML pipelines only) |
| **Policy storage** | MongoDB document | PostgreSQL table | MongoDB document |
| **Vector search** | In-memory brute-force | pgvector `<=>` (indexable) | Lance KNN table function |
| **Queue enrichment** | 4+K+N round-trips | **1 PostgreSQL CTE query** | **1 federated SQL query** |
| **Cross-source joins** | TypeScript glue code | Native SQL JOINs | Native SQL across stores |
| **Complex logic** | TypeScript services | PostgreSQL functions (RPC) | YAML pipeline SQL |
| **Backend code** | ~976 lines, 18 service files | ~500 lines, 16 files | ~300 lines, 8 YAML files |
| **Infrastructure** | 3 separate services to run | 1 Supabase project | 3 services + Skardi server |
| **Admin UI** | None | Supabase Studio (built-in) | None |

---

## Non-Functional Requirements

| Concern | Requirement |
|---|---|
| Queue enrichment latency | Single PostgreSQL CTE query; no N+1 round-trips |
| Vector search scalability | pgvector supports HNSW index for sub-linear KNN at scale |
| Data privacy | Supabase Row Level Security (RLS) for role-scoped access |
| Policy updates | UPDATE the `policies` table; no code changes required |
| Observability | Supabase Dashboard shows query stats, slow queries, and realtime logs |
