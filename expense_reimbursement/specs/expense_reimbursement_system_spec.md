# Intelligent Expense Audit & Anomaly Detection — System Specification

## Overview

A Skardi-powered intelligent expense audit system that demonstrates federated multi-source querying, vector similarity search, and ML-based anomaly scoring — all exposed as REST APIs via YAML pipeline definitions with zero custom backend code.

The system ingests expense claims, cross-references vendor and policy data across multiple data sources, detects duplicate or suspicious claims via semantic similarity, scores anomaly risk via an ONNX model, and automatically routes high-risk claims to an elevated approval tier.

---

## Why Skardi

Traditional implementation would require:
- Separate services for claim management, vendor lookup, similarity search, model serving
- Custom connectors and ORM layers per data source
- Data synchronization jobs across systems
- Significant glue code for cross-source joins

With Skardi:
- Data stays in its authoritative source; no sync required
- Cross-source joins are expressed as SQL
- Vector similarity search is a table function call
- ML inference is embedded in the query
- Each pipeline is a YAML file that becomes a REST endpoint automatically

---

## Data Sources

| Source | Technology | Owner | Contents |
|---|---|---|---|
| `claims_db` | MySQL | Finance | Expense claims and approval records |
| `policy_store` | MongoDB | HR/Compliance | Reimbursement policy rules, category limits |
| `embeddings_store` | Lance | Platform | Claim embeddings for semantic deduplication |

---

## Roles

| Role | Description |
|---|---|
| **Employee (Claimant)** | Submits claims via frontend; receives status updates |
| **L1 Approver** | Reviews pending claims; sees anomaly score, vendor risk, employee risk, and similar-claim suggestions |
| **Senior Auditor (L2 Approver)** | Handles high anomaly-score claims escalated by the system |
| **System Admin** | Manages pipeline configs and policy limits |

---

## Claim Lifecycle

```
SUBMITTED → PENDING (awaiting review)
         → APPROVED (L1 or L2 decision)
         → REJECTED (L1 or L2 decision, with comment)
```

High anomaly-score claims (`anomaly_score ≥ 0.4`) are surfaced first in the approver queue (sorted by `anomaly_score DESC`).

---

## Skardi Pipelines

### 1. `submit_claim`
Accepts a new claim submission and writes it to MySQL.

**Sources**: `claims_db` (write)

**Input**: `employee_id`, `amount`, `category`, `vendor_name`, `description`

**Output**: `claim_id`, `status`, `submitted_at`

---

### 2. `enrich_queue`
Full approver-queue enrichment in a single federated query spanning MySQL and MongoDB.

**Sources**: `claims_db` (read), `policy_store` (read)

**Input**: `status` (claim status filter, e.g. `'PENDING'`)

**Output**: per-claim row with `claim_id`, `employee_id`, `amount`, `category`, `vendor_name`, `status`, `anomaly_score`, `submitted_at`, `budget_headroom`, `vendor_rejection_rate`, `employee_risk_ratio`, `policy_monthly_limit`

**Logic** — three CTEs computed entirely within MySQL, then joined against MongoDB policies:

- `budget_usage` — month-to-date non-rejected spend per category, aggregated directly from `claims` (no join to `approval_records`, which would double-count claims that have multiple approval events):
  ```sql
  SELECT category, SUM(amount) AS spent_this_month
  FROM   claims
  WHERE  status != 'REJECTED'
    AND  submitted_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
  GROUP  BY category
  ```
- `vendor_risk` — historical rejection rate per vendor, from `approval_records ⋈ claims`
- `employee_risk` — fraction of high-anomaly (`> 0.4`) claims **per submitter** (`c.employee_id`), aggregated directly from `claims` (not from `approval_records.approver_id`, which would measure approver behaviour instead of submitter risk):
  ```sql
  SELECT c.employee_id,
         ROUND(AVG(CASE WHEN c.anomaly_score > 0.4 THEN 1.0 ELSE 0.0 END), 4) AS risk_ratio
  FROM   claims c
  GROUP  BY c.employee_id
  ```
- `budget_headroom` derived as `policy.monthly_limit − budget_usage.spent_this_month`
- Results ordered by `anomaly_score DESC, submitted_at ASC`

In a traditional backend, the equivalent requires 4+ MySQL round-trips plus one MongoDB call per unique category (N+1 pattern).

---

### 3. `approve_or_reject_claim`
Records an approval decision and updates the claim status.

**Sources**: `claims_db` (write)

**Input**: `claim_id`, `approver_id`, `decision` (`APPROVE` | `REJECT`), `comment`

**Output**: `claim_id`, `new_status`

---

### 4. `find_similar_claims`
Returns the top similar historical claims to a given embedding via vector KNN search.

**Sources**: `embeddings_store` (Lance)

**Input**: `embedding` (float array)

**Output**: `claim_id`, `_distance` (cosine distance) for top-K neighbours

---

## Anomaly Score

`anomaly_score` is stored on each claim row in MySQL. Claims with `anomaly_score ≥ 0.4` are surfaced at the top of the approver queue.

---

## Business Rules

1. A claim cannot be approved by the same person who submitted it.
2. Claims with high similarity distance to existing claims may indicate duplicates; approvers are shown similar claims via `find_similar_claims`.
3. `budget_headroom` is computed live at query time from non-rejected month-to-date spend; no materialized budget table is maintained.

---

## Integration Points

| System | Integration |
|---|---|
| **Frontend / Mobile App** | Calls Skardi REST API endpoints directly |
| **Embedding Service** | Generates claim embeddings externally; stored in Lance dataset |

---

## Non-Functional Requirements

| Concern | Requirement |
|---|---|
| Queue enrichment latency | Single federated query across MySQL + MongoDB; no N+1 round-trips |
| Data privacy | Role-scoped pipeline access |
| Scalability | Stateless Skardi server; horizontal scaling via load balancer |
| Policy updates | MongoDB document update; no pipeline code changes required |
