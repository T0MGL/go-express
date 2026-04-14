import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return 'Gs. 0';
  return `Gs. ${amount.toLocaleString('es-PY')}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

export function timeAgo(dateStr: string, timeStr?: string): string {
  if (!dateStr) return '';
  const date = timeStr
    ? new Date(`${dateStr}T${timeStr}:00`)
    : new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD < 7) return `hace ${diffD}d`;
  if (diffD < 30) return `hace ${Math.floor(diffD / 7)}sem`;
  return formatDate(dateStr);
}

export function formatDateSmart(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays > 1 && diffDays < 7) return `hace ${diffDays} dias`;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return formatDate(`${year}-${month}-${day}`);
}

export function formatTimestampSmart(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffH < 24) return `hace ${diffH} h`;
  if (diffD < 7) return `hace ${diffD} ${diffD === 1 ? 'dia' : 'dias'}`;
  return formatTimestamp(iso);
}

/**
 * Parse an ISO timestamp into separate date and time strings.
 * Returns { date: "2026-03-26", time: "14:30" } for display purposes.
 */
export function parseTimestamp(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

/**
 * Format an ISO timestamp into a user-friendly date string.
 * e.g. "26 mar 2026"
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const { date } = parseTimestamp(iso);
  return formatDate(date);
}

/**
 * Format an ISO timestamp into a user-friendly time string.
 * e.g. "14:30"
 */
export function formatTimestampTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const { time } = parseTimestamp(iso);
  return time;
}
