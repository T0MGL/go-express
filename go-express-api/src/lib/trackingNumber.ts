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
 * Generate multiple tracking numbers in a batch (for bulk import).
 * Uses a single query with generate_series for efficiency.
 */
export async function generateTrackingNumberBatch(supabase: SupabaseClient, count: number): Promise<string[]> {
  if (count <= 0 || count > 1000) throw new Error('Batch size must be between 1 and 1000');

  // Use raw SQL via RPC or a custom function
  const numbers: string[] = [];
  for (let i = 0; i < count; i++) {
    numbers.push(await generateTrackingNumber(supabase));
  }
  return numbers;
}

/**
 * Validate tracking number format: GE + 4 digits year + 6 digits sequence
 */
export function isValidTrackingNumber(tn: string): boolean {
  return /^GE\d{10}$/.test(tn);
}
