---
name: expense-skardi
description: Start the expense reimbursement demo with the Skardi federated query backend. Runs infrastructure, seeds data, starts the Skardi server (with pipelines loaded at startup via --pipeline flag), and starts the Vite frontend.
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

---

## Step 0 — Pull the Skardi Docker image

```bash
docker pull ghcr.io/skardilabs/skardi:latest
```

Skip this step if the image is already present locally (`docker images ghcr.io/skardilabs/skardi`).

---

## Step 1 — Start infrastructure (MySQL + MongoDB)

```bash
docker compose up -d mysql mongo
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
mkdir -p data
python3 seed/create_lance_dataset.py ./data/claim_vectors.lance
```

---

## Step 4 — Start the Skardi server

```bash
docker compose up -d skardi
```

The container uses `ctx_expense_docker.yaml` (Docker service hostnames) and mounts `./pipelines` and `./data` read-only. Pipelines are loaded automatically at startup via the `--pipeline /app/pipelines` flag — no separate registration step needed.

Wait until the container is running before proceeding:

```bash
docker compose logs -f skardi
```

Wait until you see the server ready message (all 8 pipelines listed), then Ctrl-C.

---

## Step 5 — Start the frontend

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
- To stop: run `docker compose down`.
- If pipeline registration fails with a schema mismatch, check that the Lance dataset was created correctly and that MongoDB documents have string `_id` fields.
