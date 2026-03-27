# Expense Reimbursement Demo

A three-way comparison of backend paradigms for the same expense reimbursement app — a **traditional TypeScript/Express API**, a **Supabase-backed Express API**, and a **Skardi federated query backend** — all sharing one React frontend.

## What This Demo Shows

| | Traditional | Supabase | Skardi |
|---|---|---|---|
| **Backend** | Express + TypeScript | Express + TypeScript | Skardi server (Rust) |
| **Business logic** | ~976 lines, 18 service files | ~500 lines, 16 files | ~300 lines, 8 YAML files |
| **Data stores** | MySQL + MongoDB + Lance | Supabase PostgreSQL + pgvector | MySQL + MongoDB + Lance |
| **Cross-source joins** | TypeScript glue code | Native SQL JOINs | Native federated SQL |
| **Queue enrichment queries** | 4 + K categories + N claims | **1** (PostgreSQL CTE + LATERAL) | **1** (federated SQL) |
| **Port** | 8082 | 8083 | 8081 |

All three backends serve the same Vite frontend on **http://localhost:5173**, switched via an env var.

---

## Data Sources

### Traditional & Skardi — three separate stores

```
           Frontend (Vite :5173)
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
 Traditional   Supabase     Skardi
 Express:8082  Express:8083  :8081
       │           │           │
       │           │           └─────────────────┐
       └───────────┼──────────────────┐          │
       ┌───────────┘           ┌──────┴──────┐   │
       ▼             ▼         │  Supabase   │   └──────────────────────┐
    MySQL          MongoDB     │  PostgreSQL │               ┌──────────┴──┐
    claims         policies    │  + pgvector │          MySQL+MongoDB+Lance
    vendors                    │             │
    approval_records           │ claims      │
                               │ vendors     │
                               │ approvals   │
                               │ policies    │  ← was MongoDB
                               │ embeddings  │  ← was Lance file
                               └─────────────┘
```

| Source (Traditional/Skardi) | Data | Supabase Equivalent |
|---|---|---|
| MySQL | `claims`, `vendors`, `approval_records` | PostgreSQL table |
| MongoDB | `policies` (per-category limits) | PostgreSQL table |
| Lance | `claim_vectors` (KNN duplicate detection) | `claim_embeddings` with `vector(8)` (pgvector) |

---

## Quickest Way to Run — Use Claude Skills

The fastest way to get the demo running is to use the built-in Claude Code skills. Open this directory in Claude Code and invoke:

**Skardi backend (recommended for the demo):**
```
/expense-skardi
```

**Traditional TypeScript backend:**
```
/expense-traditional
```

Each skill walks through every setup step automatically — Docker, seeding, server startup, and frontend launch.

---

## Manual Setup

### Prerequisites

- **All backends:** Node.js 18+
- **Traditional / Skardi:** Docker
- **Traditional / Skardi:** Python 3 with `pip3` (for Lance seed)
- **Supabase:** [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`) **or** a Supabase cloud project

---

### Traditional Backend

#### 1. Start infrastructure

```bash
# From expense_reimbursement/
docker compose up -d mysql mongo

# Seed MySQL (auto-run on first start via Docker init)
# If needed manually:
docker exec -i expense_mysql mysql -u root -prootpass expense_db < seed/init_mysql.sql

# Seed MongoDB
docker exec -i expense_mongo mongosh -u root -p rootpass \
  --authenticationDatabase admin \
  --eval "$(cat seed/seed_mongo.js)"

# Create Lance vector dataset
pip3 install lancedb pyarrow numpy 2>/dev/null | tail -1
mkdir -p data
python3 seed/create_lance_dataset.py ./data/claim_vectors.lance
```

#### 2. Start backend

```bash
cd backend && npm install && npm run dev
# Runs on http://localhost:8082
```

#### 3. Start frontend

```bash
cd frontend && npm install
VITE_API_BACKEND=traditional npm run dev
# Open http://localhost:5173
```

---

### Supabase Backend

Everything runs in a single Supabase PostgreSQL database — no separate MySQL, MongoDB, or Lance needed.

#### Option A — Local (Supabase CLI)

```bash
# 1. Initialize and start local Supabase
supabase init          # once, creates supabase/ config dir
supabase start         # starts PostgreSQL + PostgREST + Studio on Docker

# 2. Seed the database (creates tables, functions, and all seed data)
psql "$(supabase status | grep 'DB URL' | awk '{print $3}')" \
  -f seed/init_supabase.sql

# 3. Copy the anon key printed by `supabase start` into your env
#    (or it's in supabase/.env after `supabase start`)
export SUPABASE_URL=http://localhost:54321
export SUPABASE_ANON_KEY=<anon-key-from-supabase-start>

# 4. Start backend
cd backend_supabase && npm install
SUPABASE_URL=$SUPABASE_URL SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY npm run dev
# Runs on http://localhost:8083

# 5. Start frontend
cd frontend && npm install
VITE_API_BACKEND=supabase npm run dev
# Open http://localhost:5173
```

#### Option B — Supabase Cloud

```bash
# 1. Create a project at https://supabase.com
#    Note the Project URL and anon key from Settings → API

# 2. In Supabase Studio → SQL editor, run:
#    seed/init_supabase.sql   (paste contents or use the file upload)

# 3. Start backend
cd backend_supabase && npm install
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
npm run dev

# 4. Start frontend
cd frontend && npm install
VITE_API_BACKEND=supabase npm run dev
```

---

### Skardi Backend

#### 1. Start infrastructure (same as Traditional)

```bash
docker compose up -d mysql mongo

docker exec -i expense_mongo mongosh -u root -p rootpass \
  --authenticationDatabase admin \
  --eval "$(cat seed/seed_mongo.js)"

mkdir -p data
python3 seed/create_lance_dataset.py ./data/claim_vectors.lance
```

#### 2. Start Skardi server

```bash
docker pull ghcr.io/skardilabs/skardi/skardi-server:latest
docker compose up -d skardi
```

The server uses `ctx_expense_docker.yaml` (Docker service hostnames) and mounts `./pipelines` and `./data` read-only. All 8 pipelines load automatically at startup.

#### 3. Start frontend

```bash
cd frontend && npm install && npm run dev
# VITE_API_BACKEND defaults to skardi
# Open http://localhost:5173
```

---

## Backend Comparison

### Queue Enrichment — the key demo point

The approver dashboard (`GET /queue?status=PENDING_L1`) requires data from multiple sources.

**Traditional** — `QueueEnrichmentService.enrichQueue()` in 5 steps:
```
Round-trip 1      ClaimsService.listByStatus()          MySQL SELECT
Round-trips 2–4   getBudgetUsage, getVendorRates,        MySQL × 3 (parallel)
                  getEmployeeRiskRatios
Round-trips 5–5+K PolicyService.getByCategory()          MongoDB × K categories
Round-trips 5+K…N SimilarityService.findSimilar()        Lance KNN × N claims
─────────────────────────────────────────────────────────
Total: 4 + K_categories + N_claims  (10–50+ queries for a real queue)
```

**Supabase** — `supabase.rpc('enrich_queue')` → 1 PostgreSQL CTE query:
```sql
WITH budget_usage AS (...), vendor_risk AS (...), employee_risk AS (...)
SELECT c.*, budget_headroom, vendor_rejection_rate, employee_risk_ratio,
       policy_monthly_limit, sim.nearest_id, sim.nearest_dist
FROM claims c
LEFT JOIN policies p      ON p.category    = c.category
LEFT JOIN budget_usage bu ON bu.category   = c.category
LEFT JOIN vendor_risk vr  ON vr.vendor_name = c.vendor_name
LEFT JOIN employee_risk er ON er.employee_id = c.employee_id
LEFT JOIN LATERAL (            ← pgvector KNN per claim, inside the same query
  SELECT e2.claim_id, e1.embedding <=> e2.embedding AS nearest_dist
  FROM claim_embeddings e1, claim_embeddings e2
  WHERE e1.claim_id = c.claim_id AND e2.claim_id != c.claim_id
  ORDER BY nearest_dist LIMIT 1
) sim ON true
WHERE c.status = $1
ORDER BY anomaly_score DESC NULLS LAST, submitted_at ASC
─────────────────────────────────────────────────────────
Total: 1 query
```

**Skardi** — `enrich_queue.yaml` pipeline → 1 federated SQL query across MySQL + MongoDB:
```
Total: 1 query
```

---

## Pipelines (Skardi)

| Pipeline | Sources | Operation | Key Feature |
|---|---|---|---|
| `submit_claim` | MySQL | INSERT | Claim submission |
| `score_claim` | MySQL + MongoDB | SELECT | Federated anomaly scoring |
| `find_similar_claims` | Lance | SELECT | KNN vector similarity search |
| `get_claim_context` | MySQL × 2 + MongoDB | SELECT | 3-source join for approver view |
| `list_pending_approvals` | MySQL | SELECT | Queue listing by status |
| `list_my_claims` | MySQL | SELECT | Claims by employee |
| `approve_or_reject_claim` | MySQL | INSERT | Decision recording |
| `enrich_queue` | MySQL + MongoDB | SELECT | Full enriched queue in 1 query |

---

## Stopping

```bash
# Kill Node/tsx processes (Ctrl-C in each terminal), then:

# Traditional / Skardi:
docker compose down

# Supabase local:
supabase stop
```
