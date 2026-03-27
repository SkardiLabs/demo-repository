import { supabase } from '../db/supabase'
import type { Vendor } from '../types'

// ── VendorService ─────────────────────────────────────────────────────────

export class VendorService {

  async getByName(vendorName: string): Promise<Vendor | null> {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('vendor_name', vendorName)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data as Vendor | null
  }
}
