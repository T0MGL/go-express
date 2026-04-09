export const PHONE_REGEX = /^\+595\d{9}$/;
export const PHONE_PLACEHOLDER = '+595981123456';

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('595')) return `+${digits}`;
  if (digits.startsWith('0')) return `+595${digits.slice(1)}`;
  return `+595${digits}`;
}

export function isValidPhone(input: string): boolean {
  return PHONE_REGEX.test(normalizePhone(input));
}
