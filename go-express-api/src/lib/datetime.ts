/**
 * Paraguay timezone date utilities.
 * Paraguay is UTC-4 (no DST since 2024). All date calculations that need
 * "today" or "current date" for business logic MUST use these helpers
 * instead of raw `new Date().toISOString().split('T')[0]`, which returns
 * the UTC date and is wrong after 8 PM Paraguay time.
 */

const PY_TIMEZONE = 'America/Asuncion';

/**
 * Returns today's date in Paraguay as YYYY-MM-DD string.
 */
export function todayPY(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: PY_TIMEZONE });
}

/**
 * Returns the start of today in Paraguay as an ISO timestamp (UTC).
 * Useful for "created today" or "gte" queries against timestamptz columns.
 */
export function startOfTodayPY(): string {
  const dateStr = todayPY();
  const pyMidnight = new Date(`${dateStr}T00:00:00-04:00`);
  return pyMidnight.toISOString();
}

/**
 * Returns the current timestamp as ISO string (UTC). For created_at, updated_at.
 */
export function nowISO(): string {
  return new Date().toISOString();
}
