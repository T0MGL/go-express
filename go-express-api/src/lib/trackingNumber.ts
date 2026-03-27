import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generate a unique tracking number using the PostgreSQL sequence.
 * Format: GE2026XXXXXX (prefix + year + 6-digit sequence)
 */
export async function generateTrackingNumber(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('generate_tracking_number');
  if (error) throw new Error(`Failed to generate tracking number: ${error.message}`);
  return data as string;
}


/**
 * Validate tracking number format: GE + 4 digits year + 6 digits sequence
 */
export function isValidTrackingNumber(tn: string): boolean {
  return /^GE\d{10}$/.test(tn);
}
