import { pool } from '../db/supabase'
import type { Policy } from '../types'

export class PolicyService {

  async getByCategory(category: string): Promise<Policy | null> {
    const { rows } = await pool.query<Policy>(
      `SELECT * FROM policies WHERE category = $1`,
      [category],
    )
    return rows[0] ?? null
  }
}
