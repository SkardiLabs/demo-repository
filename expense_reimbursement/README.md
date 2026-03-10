# Expense Reimbursement Demo

A Skardi demo that shows federated multi-source querying across **MySQL**,
**MongoDB**, and **Lance** — with zero custom backend code.

## Architecture

```
                    Skardi REST API
                         │
         ┌───────────────┼─────────────────┐
         ▼               ▼                 ▼
  MySQL (expense_db)  MongoDB (expense_db) Lance (file)
  ├── claims          └── policies         └── claim_vectors
  ├── vendors
  └── approval_records
```

| Source    | Data                              | Purpose                      |
|-----------|-----------------------------------|------------------------------|
| MySQL     | `claims`, `vendors`, `approval_records` | Core claim lifecycle   |
| MongoDB   | `policies`                        | Policy rules per category     |
| Lance     | `claim_vectors`                   | Semantic duplicate detection  |

> PostgreSQL and Iceberg are intentionally omitted for easier local setup.
> The `score_claim` pipeline replaces the ONNX model with rule-based SQL scoring.

## Quick Start

### 1. Start infrastructure

```bash
cd crates/server/demo/expense_reimbursement
docker compose up -d
```

MySQL seeds `claims`, `vendors`, and `approval_records` automatically on first
start via `seed/init_mysql.sql`.

### 2. Seed MongoDB policies

```bash
docker exec -i expense_mongo mongosh -u root -p rootpass \
  --authenticationDatabase admin \
  --eval "$(cat seed/seed_mongo.js)"
```

### 3. Create Lance claim-vector dataset

```bash
# From workspace root:
pip install lance pyarrow numpy
python crates/server/demo/expense_reimbursement/seed/create_lance_dataset.py
```

### 4. Start Skardi server

```bash
# From workspace root:
export MYSQL_USER=skardi
export MYSQL_PASSWORD=skardi123
export MONGO_USER=root
export MONGO_PASS=rootpass

cargo run --bin skardi-server -- \
  --ctx  crates/server/demo/expense_reimbursement/ctx_expense.yaml \
  --port 8080
```

### 5. Register pipelines

```bash
for p in crates/server/demo/expense_reimbursement/pipelines/*.yaml; do
  curl -s -X POST http://localhost:8080/register_pipeline \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$p\"}"
  echo
done
```

---

## Pipeline Walkthrough

### Submit a new claim

```bash
curl -X POST http://localhost:8080/submit_claim/execute \
  -H "Content-Type: application/json" \
  -d '{
    "claim_id":    "C008",
    "employee_id": "E005",
    "amount":      650.00,
    "category":    "Travel",
    "vendor_name": "Sketchy Gadgets",
    "expense_date":"2026-03-05",
    "description": "Conference trip",
    "receipt_url": "https://receipts/C008.pdf"
  }'
```

---

### Score a claim (federated: MySQL + MongoDB)

```bash
curl -X POST http://localhost:8080/score_claim/execute \
  -H "Content-Type: application/json" \
  -d '{"claim_id": "C008"}'
```

```json
{
  "data": [{
    "claim_id": "C008",
    "amount": 650.0,
    "category": "Travel",
    "vendor_name": "Sketchy Gadgets",
    "is_approved_vendor": 0,
    "vendor_avg_amount": 0.0,
    "policy_limit": 500.0,
    "prior_claims_same_category": 0,
    "anomaly_score": 0.5,
    "routing_decision": "ELEVATED_REVIEW"
  }],
  "rows": 1,
  "success": true
}
```

> Scoring factors triggered:
> - `+0.25` vendor not in approved registry
> - `+0.25` amount (650) exceeds Travel policy limit (500)

---

### Get full approver context (federated: MySQL × 2 + MongoDB)

```bash
curl -X POST http://localhost:8080/get_claim_context/execute \
  -H "Content-Type: application/json" \
  -d '{"claim_id": "C004"}'
```

---

### List pending claims for auditor review

```bash
curl -X POST http://localhost:8080/list_pending_approvals/execute \
  -H "Content-Type: application/json" \
  -d '{"status": "PENDING_AUDITOR"}'
```

---

### Find semantically similar claims (Lance KNN)

```bash
curl -X POST http://localhost:8080/find_similar_claims/execute \
  -H "Content-Type: application/json" \
  -d '{"reference_claim_id": "C006", "k": 3}'
```

---

### Record an approval decision

```bash
curl -X POST http://localhost:8080/approve_or_reject_claim/execute \
  -H "Content-Type: application/json" \
  -d '{
    "record_id":    "R001",
    "claim_id":     "C001",
    "approver_id":  "MGR001",
    "decision":     "APPROVE",
    "comment":      "Amount within limits, approved vendor.",
    "approval_tier":"L1"
  }'
```

---

## Pipelines at a Glance

| Pipeline                  | Sources               | Operation  | Key Feature                     |
|---------------------------|-----------------------|------------|---------------------------------|
| `submit_claim`            | MySQL (claims)        | INSERT     | Claim submission                |
| `score_claim`             | MySQL + MongoDB       | SELECT     | Federated anomaly scoring       |
| `find_similar_claims`     | Lance                 | SELECT     | KNN vector similarity search    |
| `get_claim_context`       | MySQL × 2 + MongoDB   | SELECT     | 3-source join for approver view |
| `list_pending_approvals`  | MySQL (claims)        | SELECT     | Queue listing by status         |
| `approve_or_reject_claim` | MySQL (approval_records) | INSERT  | Decision recording              |

## Why no PostgreSQL / Iceberg?

| Original source  | Removed because                          | Replaced with                    |
|------------------|------------------------------------------|----------------------------------|
| PostgreSQL       | Redundant with MySQL for local demo      | MySQL (claims + vendors in one DB) |
| Iceberg          | Requires Spark/Trino, heavy local setup  | MySQL approval_records (simpler audit trail) |
