import { getDb } from '../db/mongo'
import type { Policy } from '../types'

// ── PolicyService ─────────────────────────────────────────────────────────
// Owns all reads from the MongoDB `policies` collection.
// This is the service that crosses the storage-engine boundary — MySQL for
// transactional data, MongoDB for document-oriented policy rules.
//
// In Skardi a single federated SQL JOIN bridges both stores in one query.
// Here the caller (ScoringService / route handler) must explicitly call this
// service and merge the result in application code.

export class PolicyService {
  async getByCategory(category: string): Promise<Policy | null> {
    const db = await getDb()
    const doc = await db.collection('policies').findOne({ category })
    if (!doc) return null
    return {
      category: doc.category as string,
      per_claim_limit: doc.per_claim_limit as number,
      monthly_limit: doc.monthly_limit as number,
      requires_receipt: doc.requires_receipt as boolean,
      notes: (doc.notes as string) ?? null,
    }
  }

  async listAll(): Promise<Policy[]> {
    const db = await getDb()
    const docs = await db.collection('policies').find().toArray()
    return docs.map(doc => ({
      category: doc.category as string,
      per_claim_limit: doc.per_claim_limit as number,
      monthly_limit: doc.monthly_limit as number,
      requires_receipt: doc.requires_receipt as boolean,
      notes: (doc.notes as string) ?? null,
    }))
  }
}
