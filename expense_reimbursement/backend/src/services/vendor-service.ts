import { query } from '../db/mysql'
import type { Vendor } from '../types'

// ── VendorService ─────────────────────────────────────────────────────────
// Owns all reads from the `vendors` MySQL table.
// In a real microservice architecture this would be a separate service behind
// an internal HTTP/gRPC boundary. Here it is a plain class to show the
// conceptual separation without the network overhead.

export class VendorService {
  async getByName(vendorName: string): Promise<Vendor | null> {
    const rows = await query<Vendor>(
      `SELECT vendor_id, vendor_name, is_approved, avg_invoice_amount, category
       FROM   vendors
       WHERE  vendor_name = ?`,
      [vendorName],
    )
    return rows[0] ?? null
  }

  async listAll(): Promise<Vendor[]> {
    return query<Vendor>(
      `SELECT vendor_id, vendor_name, is_approved, avg_invoice_amount, category
       FROM   vendors
       ORDER  BY vendor_name`,
    )
  }
}
