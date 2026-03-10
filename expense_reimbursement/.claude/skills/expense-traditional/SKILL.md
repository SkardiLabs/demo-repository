---
name: expense-traditional
description: Start the expense reimbursement demo with the traditional TypeScript/Express backend. Runs infrastructure, seeds data, starts the Express API server and Vite frontend.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read
---

Start the expense reimbursement demo using the **traditional TypeScript backend** (Express + mysql2 + mongodb).

Follow these steps in order. Run each step and confirm it succeeds before proceeding.

## Demo directory

All paths below are relative to the workspace root (this directory):
```
./
```

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

---

## Step 3 — Create Lance claim-vector dataset

```bash
pip3 install lancedb pyarrow numpy 2>/dev/null | tail -1
python3 seed/create_lance_dataset.py
```

---

## Step 4 — Start the traditional Express backend

```bash
cd backend && npm install && npm run dev
```

The server starts on **http://localhost:8082**. Run this in a separate terminal or background process.

---

## Step 5 — Start the frontend

In a separate terminal:

```bash
cd frontend && npm install && npm run dev
```

Vite starts on **http://localhost:5173** by default.

---

## Verify

Check the backend is up:
```bash
curl -s http://localhost:8082/claims | head -c 200
```

---

## Notes

- The traditional backend connects **directly** to MySQL and MongoDB using connection pools in `backend/src/db/`.
- Business logic (filtering, sorting, aggregation, cross-source joins) is implemented manually in TypeScript service classes across 18 files (~976 lines).
- To stop: `docker compose down`.
