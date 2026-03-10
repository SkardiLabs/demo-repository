---
name: expense-skardi
description: Start the expense reimbursement demo with the Skardi federated query backend. Runs infrastructure, seeds data, starts the Skardi server, registers YAML pipelines, and starts the Vite frontend.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

Start the expense reimbursement demo using the **Skardi backend** (federated SQL pipelines across MySQL, MongoDB, and Lance — no custom application code).

Follow these steps in order. Run each step and confirm it succeeds before proceeding.

## Demo directory

All paths below are relative to the workspace root (this directory):
```
./
```

The Skardi server binary will be cloned and built in `../tmp/skardi`.

---

## Step 0 — Clone and build the Skardi repo

```bash
mkdir -p ../../tmp
git clone https://github.com/SkardiLabs/skardi ../../tmp/skardi
cargo build --manifest-path ../../tmp/skardi/Cargo.toml --bin skardi-server
```

Skip this step if `../../tmp/skardi` already exists. Wait for the build to complete before proceeding.

**Note:** Requires rustc ≥ 1.91.0. If the build fails with a version error, run `rustup update stable` first.

---

## Step 1 — Start infrastructure (MySQL + MongoDB)

```bash
docker compose up -d
```

Wait for containers to be healthy. MySQL seeds `claims`, `vendors`, and `approval_records` automatically via `seed/init_mysql.sql`.

---

## Step 2 — Seed MongoDB policies

```bash
docker exec -i expense_mongo mongosh -u root -p rootpass \
  --authenticationDatabase admin \
  --eval "$(cat seed/seed_mongo.js)"
```

Confirm output shows documents inserted into `expense_db.policies`.

**Important:** Each policy document must have `_id` set to the category string (e.g. `"Travel"`) so the MongoTableProvider returns the correct value for the primary key field.

---

## Step 3 — Create Lance claim-vector dataset

```bash
pip3 install lancedb pyarrow numpy 2>/dev/null | tail -1
python3 seed/create_lance_dataset.py
```

---

## Step 4 — Start the Skardi server

```bash
export MYSQL_USER=skardi
export MYSQL_PASSWORD=skardi123
export MONGO_USER=root
export MONGO_PASS=rootpass

cargo run --manifest-path ../../tmp/skardi/Cargo.toml --bin skardi-server -- \
  --ctx "$(pwd)/ctx_expense.yaml" \
  --port 8081
```

Run this in a separate terminal. Use port **8081** (8080 is occupied by OrbStack).

Wait until you see the server ready message before proceeding.

---

## Step 5 — Register pipelines

```bash
for p in pipelines/*.yaml; do
  echo "Registering $p..."
  curl -s -X POST http://localhost:8081/register_pipeline \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$(pwd)/$p\"}" | python3 -m json.tool
  echo
done
```

All 8 pipelines should register successfully: `submit_claim`, `score_claim`, `find_similar_claims`, `get_claim_context`, `list_pending_approvals`, `approve_or_reject_claim`, `enrich_queue`, and any others in the pipelines directory.

---

## Step 6 — Start the frontend

In a separate terminal:

```bash
cd frontend && npm install && npm run dev
```

Vite starts on **http://localhost:5173** by default. Point it at the Skardi server on port 8081.

---

## Verify

Test a federated query (MySQL + MongoDB join):
```bash
curl -s -X POST http://localhost:8081/score_claim/execute \
  -H "Content-Type: application/json" \
  -d '{"claim_id": "C001"}' | python3 -m json.tool
```

Test vector similarity (Lance KNN):
```bash
curl -s -X POST http://localhost:8081/find_similar_claims/execute \
  -H "Content-Type: application/json" \
  -d '{"reference_claim_id": "C001"}' | python3 -m json.tool
```

---

## Notes

- **No application code** — all business logic lives in 8 YAML pipeline files (~300 lines total).
- Cross-source joins (MySQL × 2 + MongoDB), vector KNN, and INSERT operations are all expressed as declarative SQL in the pipeline YAMLs.
- To stop: kill the `cargo run` process and run `docker compose down`.
- If pipeline registration fails with a schema mismatch, check that the Lance dataset was created correctly and that MongoDB documents have string `_id` fields.
