# Intelligent Expense Audit & Anomaly Detection — Traditional Backend Specification

## Overview

A microservice-based intelligent expense audit system supporting the full lifecycle of expense claims, from submission through anomaly detection, approval, payment, and audit. The system cross-references vendor and policy data, detects duplicate or suspicious claims via semantic similarity, scores anomaly risk via an ML model, and automatically routes high-risk claims to an elevated approval tier.

---

## Architecture

The system is composed of three backend services, each owning its data store, communicating over REST.

```
                        ┌─────────────────┐
                        │   API Gateway   │
                        └────────┬────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐   ┌──────────▼──────┐   ┌───────────▼───────┐
│  Claims Service │   │ Policy Service  │   │ Similarity Service│
│  (MySQL)        │   │  (MongoDB)      │   │  (Lance)          │
└─────────────────┘   └─────────────────┘   └───────────────────┘
```

---

## Services

### 1. Claims Service
**Responsibility**: CRUD for expense claims and approval records. Owns the claim state machine.

**Stack**: REST API (e.g. FastAPI / Spring Boot), MySQL

**Endpoints**:
- `POST /claims` — submit a new claim
- `GET /claims?status=` — list claims with filters
- `POST /claims/{claim_id}/decisions` — record an approval or rejection

**Database schema** (MySQL):
```sql
claims (claim_id, employee_id, amount, category, vendor_name,
        description, status, anomaly_score, submitted_at)

approval_records (record_id, claim_id, approver_id, decision,
                  comment, decided_at)
```

---

### 2. Policy Service
**Responsibility**: Stores reimbursement policy rules and monthly limits per category.

**Stack**: REST API, MongoDB

**Endpoints**:
- `GET /policies?category=` — get policy limits for a category
- `POST /policies` — create or update policy (admin only)

**Document schema** (MongoDB):
```json
{
  "_id": "Travel",
  "monthly_limit": 2000,
  "per_claim_limit": 500
}
```

---

### 3. Similarity Service
**Responsibility**: Stores claim embeddings and provides KNN search to detect duplicate or similar claims.

**Stack**: REST API, Lance

**Endpoints**:
- `POST /embeddings/search` — find top-K similar claims by embedding vector

**Implementation notes**:
- Lance dataset holds one vector row per claim
- Returns `[(claim_id, distance)]` sorted by distance ascending

---

## Roles

| Role | Service Access |
|---|---|
| **Employee** | Claims Service (own claims only) |
| **L1 Approver** | Claims Service (read + decisions), Policy Service, Similarity Service |
| **Senior Auditor** | Claims Service (read + decisions), Policy Service, Similarity Service |
| **System Admin** | All services, Policy Service (write) |

---

## Claim Lifecycle

```
SUBMITTED → PENDING (awaiting review)
         → APPROVED (L1 or L2 decision)
         → REJECTED (with comment)
```

---

## Anomaly Score

`anomaly_score` is computed by an ONNX model and stored on each claim row in MySQL at submission time. Claims with `anomaly_score ≥ 0.4` are surfaced at the top of the approver queue (sorted by `anomaly_score DESC`).

---

## Business Rules

1. A claim cannot be approved by the same person who submitted it.
2. Claims with high embedding similarity to existing claims may be duplicates; approvers are shown similar claims.
3. Budget headroom is computed at request time by aggregating non-rejected month-to-date spend from the Claims Service and comparing against the Policy Service limit.

---

## Queue Enrichment: The N+1 Problem

Loading the approver dashboard (`GET /queue?status=PENDING`) requires the following sequential and parallel calls from the backend orchestration layer:

```
Query 1   — ClaimsService.listByStatus('PENDING')               (MySQL)
Query 2   — ClaimsService.getBudgetUsage()                      (MySQL, aggregation)
Query 3   — ClaimsService.getVendorRejectionRates()             (MySQL, JOIN + aggregation)
Query 4   — ClaimsService.getEmployeeRiskRatios()               (MySQL, aggregation)
Query 5…K — PolicyService.getByCategory() × unique categories   (MongoDB, one call each)
```

Each `PolicyService.getByCategory()` call is a separate round-trip to MongoDB. For N unique categories in the pending queue, this is K = 4 + N total queries. Skardi collapses all of this into a single federated SQL expression.

---

## Non-Functional Requirements

| Concern | Requirement |
|---|---|
| Queue enrichment latency | N+1 queries across MySQL + MongoDB; latency grows with category count |
| Data privacy | Role-scoped API access |
| Scalability | Each service scales independently |
| Policy updates | MongoDB document update; no service code changes required |

