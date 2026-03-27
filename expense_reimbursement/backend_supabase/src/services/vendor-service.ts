import { pool } from '../db/supabase'
import type { Vendor } from '../types'

export class VendorService {

  async getByName(vendorName: string): Promise<Vendor | null> {
    const { rows } = await pool.query<Vendor>(
      `SELECT * FROM vendors WHERE vendor_name = $1`,
      [vendorName],
    )
    return rows[0] ?? null
  }
}
