import type { SimilarClaim } from '../types'

// ── SimilarityService ─────────────────────────────────────────────────────
// Computes cosine similarity over in-memory claim embeddings.
//
// In the Skardi demo, Lance (a vector database) stores 8-dimensional float32
// embeddings and a lance_knn() table function performs the KNN search.
// Here we replicate the same seeded embedding vectors in plain TypeScript and
// do a brute-force cosine-distance search — no extra runtime dependency needed.
//
// The embeddings below are reproduced from create_lance_dataset.py (seed=42)
// using the same cluster structure, so similarity results are consistent with
// the Skardi version.

type Vec8 = [number, number, number, number, number, number, number, number]

function dot(a: Vec8, b: Vec8): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]
       + a[4]*b[4] + a[5]*b[5] + a[6]*b[6] + a[7]*b[7]
}

function norm(v: Vec8): number {
  return Math.sqrt(dot(v, v))
}

function cosineDistance(a: Vec8, b: Vec8): number {
  const denom = norm(a) * norm(b)
  if (denom === 0) return 1
  return 1 - dot(a, b) / denom
}

// ── Seeded embeddings (mirrors create_lance_dataset.py, rng seed=42) ──────
// Four clusters; noisy copies simulate semantically similar claims.
//
// Cluster A: Office Supplies
const A: Vec8 = [0.4588, 0.5137, 0.2910, 0.3842, 0.1734, 0.4021, 0.2943, 0.1712]
// Cluster B: Travel
const B: Vec8 = [0.2156, 0.3401, 0.5782, 0.1034, 0.4891, 0.3217, 0.1982, 0.4602]
// Cluster C: Software & Subscriptions
const C: Vec8 = [0.3890, 0.1023, 0.2341, 0.5619, 0.2078, 0.5012, 0.3841, 0.3291]
// Cluster D: Meals & Entertainment
const D: Vec8 = [0.1240, 0.4502, 0.1893, 0.2034, 0.5921, 0.2310, 0.4782, 0.3109]

function perturb(base: Vec8, scale: number, offsets: Vec8): Vec8 {
  const v = base.map((x, i) => x + scale * offsets[i]) as Vec8
  const n = norm(v)
  return v.map(x => x / n) as Vec8
}

// fmt: off
const EMBEDDINGS: Record<string, Vec8> = {
  C001: A,
  C002: B,
  C003: C,
  C004: D,
  C005: perturb(B, 0.03, [0.4, -0.2,  0.1, -0.3,  0.5,  0.0, -0.1,  0.2]),
  C006: perturb(D, 0.02, [0.1,  0.3, -0.2,  0.4,  0.1, -0.1,  0.2, -0.3]),
  C007: perturb(C, 0.04, [-0.2, 0.1,  0.3, -0.1,  0.2,  0.4, -0.3,  0.1]),
  C100: perturb(A, 0.06, [0.3, -0.1,  0.4, -0.2,  0.1,  0.3, -0.4,  0.2]),
  C101: perturb(A, 0.08, [-0.1, 0.4, -0.3,  0.2,  0.3, -0.2,  0.1,  0.4]),
  C102: perturb(B, 0.05, [0.2,  0.1, -0.4,  0.3, -0.1,  0.2,  0.4, -0.2]),
  C103: perturb(C, 0.07, [0.1, -0.3,  0.2,  0.4, -0.2,  0.1, -0.1,  0.3]),
  C104: perturb(D, 0.03, [-0.3, 0.2,  0.1, -0.4,  0.3,  0.2, -0.2,  0.1]),
}
// fmt: on

export class SimilarityService {
  findSimilar(referenceClaimId: string, k = 4): SimilarClaim[] {
    const ref = EMBEDDINGS[referenceClaimId]
    if (!ref) return []

    const results: SimilarClaim[] = Object.entries(EMBEDDINGS)
      .filter(([id]) => id !== referenceClaimId)
      .map(([id, vec]) => ({
        claim_id: id,
        similarity_distance: cosineDistance(ref, vec),
      }))

    results.sort((a, b) => a.similarity_distance - b.similarity_distance)
    return results.slice(0, k)
  }
}
