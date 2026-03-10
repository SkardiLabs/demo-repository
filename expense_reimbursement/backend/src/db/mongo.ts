import { MongoClient, type Db } from 'mongodb'

// ── MongoDB client ────────────────────────────────────────────────────────
// Same env vars used by the Skardi server for parity.

let client: MongoClient | null = null
let db: Db | null = null

export async function getDb(): Promise<Db> {
  if (!db) {
    const host = process.env.MONGO_HOST ?? 'localhost'
    const port = process.env.MONGO_PORT ?? '27017'
    const user = process.env.MONGO_USER ?? 'root'
    const pass = process.env.MONGO_PASS ?? 'rootpass'
    const database = process.env.MONGO_DATABASE ?? 'expense_db'

    const uri = `mongodb://${user}:${pass}@${host}:${port}/${database}?authSource=admin`
    client = new MongoClient(uri)
    await client.connect()
    db = client.db(database)
  }
  return db
}
