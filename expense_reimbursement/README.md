# Expense Reimbursement Demo

A side-by-side comparison of two backend paradigms for the same expense reimbursement app — a **traditional TypeScript/Express API** and a **Skardi federated query backend** — sharing one React frontend.

## What This Demo Shows

| | Traditional | Skardi |
|---|---|---|
| **Backend** | Express + TypeScript | Skardi server (Rust) |
| **Business logic** | ~976 lines across 18 service files | ~300 lines in 8 YAML pipeline files |
| **Data access** | Manual DB calls per service | Declarative SQL across sources |
| **Cross-source joins** | Implemented in TypeScript | Native federated SQL |
| **Port** | 8082 | 8081 |

Both backends are served by the same Vite frontend on **http://localhost:5173**, switched via an env var.

---

## Data Sources

```
           Frontend (Vite :5173)
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
 Traditional backend      Skardi backend
 Express :8082             :8081
       │                       │
       └───────────┬───────────┘
                   │
     ┌─────────────┼──────────────┐
     ▼             ▼              ▼
  MySQL          MongoDB        Lance
  claims         policies       claim_vectors
  vendors        (per-category  (KNN duplicate
  approval_      limits & rules) detection)
  records
```

| Source  | Data                                    | Purpose                        |
|---------|-----------------------------------------|--------------------------------|
| MySQL   | `claims`, `vendors`, `approval_records` | Core claim lifecycle           |
| MongoDB | `policies`                              | Policy rules per category      |
| Lance   | `claim_vectors`                         | Semantic duplicate detection   |

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

Each skill walks through every setup step automatically — Docker, seeding, server startup, pipeline registration, and frontend launch.

---

## Manual Setup

### Prerequisites

- Docker
- Node.js 18+
- Python 3 with `pip3`
- Rust (for Skardi only) — requires rustc ≥ 1.91.0 (`rustup update stable`)

### Infrastructure (both backends)

```bash
# From expense_reimbursement/
docker compose up -d

# Seed MongoDB
docker exec -i expense_mongo mongosh -u root -p rootpass \
  --authenticationDatabase admin \
  --eval "$(cat seed/seed_mongo.js)"

# Create Lance vector dataset
pip3 install lancedb pyarrow numpy 2>/dev/null | tail -1
python3 seed/create_lance_dataset.py
```

### Traditional Backend

```bash
cd backend && npm install && npm run dev
# Runs on http://localhost:8082
```

Start the frontend pointed at the traditional backend:
```bash
cd frontend && npm install
VITE_API_BACKEND=traditional npm run dev
```

### Skardi Backend

Clone and build the Skardi server (one-time):
```bash
mkdir -p ../../tmp
git clone https://github.com/SkardiLabs/skardi ../../tmp/skardi
cargo build --manifest-path ../../tmp/skardi/Cargo.toml --bin skardi-server
```

Start the server:
```bash
MYSQL_USER=skardi MYSQL_PASSWORD=skardi123 \
MONGO_USER=root MONGO_PASS=rootpass \
cargo run --manifest-path ../../tmp/skardi/Cargo.toml --bin skardi-server -- \
  --ctx "$(pwd)/ctx_expense.yaml" --port 8081
```

Register pipelines:
```bash
for p in pipelines/*.yaml; do
  curl -s -X POST http://localhost:8081/register_pipeline \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$(pwd)/$p\"}"
  echo
done
```

Start the frontend (defaults to Skardi):
```bash
cd frontend && npm install && npm run dev
```

---

## Pipelines (Skardi)

| Pipeline                  | Sources                  | Operation | Key Feature                     |
|---------------------------|--------------------------|-----------|---------------------------------|
| `submit_claim`            | MySQL                    | INSERT    | Claim submission                |
| `score_claim`             | MySQL + MongoDB          | SELECT    | Federated anomaly scoring       |
| `find_similar_claims`     | Lance                    | SELECT    | KNN vector similarity search    |
| `get_claim_context`       | MySQL × 2 + MongoDB      | SELECT    | 3-source join for approver view |
| `list_pending_approvals`  | MySQL                    | SELECT    | Queue listing by status         |
| `list_my_claims`          | MySQL                    | SELECT    | Claims by employee              |
| `approve_or_reject_claim` | MySQL                    | INSERT    | Decision recording              |
| `enrich_queue`            | MySQL + MongoDB + Lance  | SELECT    | Enriched approval queue         |

---

## Stopping

```bash
# Kill Node/Cargo processes, then:
docker compose down
```
