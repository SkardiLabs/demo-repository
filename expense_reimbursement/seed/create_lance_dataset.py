#!/usr/bin/env python3
"""
Create a Lance vector dataset for claim semantic similarity search.

Each claim is represented as an 8-dimensional float32 embedding.
In production, embeddings would come from a sentence-transformer model.
Here we use seeded random vectors that place similar claims close together.

Requirements:
    pip install lancedb pyarrow numpy

Usage (from workspace root):
    python crates/server/demo/expense_reimbursement/seed/create_lance_dataset.py
"""

import os
import numpy as np
import pyarrow as pa
import lancedb

OUTPUT_PATH = "crates/server/demo/expense_reimbursement/data/claim_vectors.lance"
DIM = 8
rng = np.random.default_rng(42)


def make_embedding(base: np.ndarray, noise: float = 0.05) -> np.ndarray:
    """Create a slightly perturbed copy of a base vector (simulates similar claims)."""
    vec = base + rng.normal(0, noise, size=DIM)
    norm = np.linalg.norm(vec)
    return (vec / norm).astype(np.float32)


# ── Cluster A: Office Supplies / Acme (claims C001-like) ──────────────────
cluster_a = rng.random(DIM).astype(np.float32)
cluster_a /= np.linalg.norm(cluster_a)

# ── Cluster B: Travel expenses ─────────────────────────────────────────────
cluster_b = rng.random(DIM).astype(np.float32)
cluster_b /= np.linalg.norm(cluster_b)

# ── Cluster C: Software / subscriptions ───────────────────────────────────
cluster_c = rng.random(DIM).astype(np.float32)
cluster_c /= np.linalg.norm(cluster_c)

# ── Cluster D: Meals & Entertainment ──────────────────────────────────────
cluster_d = rng.random(DIM).astype(np.float32)
cluster_d /= np.linalg.norm(cluster_d)

records = [
    # Seed claims that match the MySQL seed data
    ("C001", make_embedding(cluster_a, noise=0.00)),  # office supplies — exact
    ("C002", make_embedding(cluster_b, noise=0.00)),  # travel — exact
    ("C003", make_embedding(cluster_c, noise=0.00)),  # software — exact
    ("C004", make_embedding(cluster_d, noise=0.00)),  # meals — exact
    ("C005", make_embedding(cluster_b, noise=0.03)),  # travel, similar to C002
    ("C006", make_embedding(cluster_d, noise=0.02)),  # meals, very similar to C004
    ("C007", make_embedding(cluster_c, noise=0.04)),  # software, similar to C003
    # Additional historical claims (already settled, used as search corpus)
    ("C100", make_embedding(cluster_a, noise=0.06)),
    ("C101", make_embedding(cluster_a, noise=0.08)),
    ("C102", make_embedding(cluster_b, noise=0.05)),
    ("C103", make_embedding(cluster_c, noise=0.07)),
    ("C104", make_embedding(cluster_d, noise=0.03)),
]

claim_ids = [r[0] for r in records]
embeddings = [r[1] for r in records]

embedding_type = pa.list_(pa.float32(), DIM)
table = pa.table(
    {
        "claim_id": pa.array(claim_ids, type=pa.string()),
        "embedding": pa.array(embeddings, type=embedding_type),
    }
)

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
db = lancedb.connect(os.path.dirname(OUTPUT_PATH))
tbl_name = os.path.basename(OUTPUT_PATH).replace(".lance", "")
db.create_table(tbl_name, data=table, mode="overwrite")

print(f"Created Lance dataset at: {OUTPUT_PATH}")
print(f"  Rows : {len(records)}")
print(f"  Dims : {DIM}")
print(f"  Schema: {table.schema}")
