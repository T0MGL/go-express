/**
 * Normaliza un nombre de ciudad para comparacion tolerante:
 * quita tildes, colapsa espacios, lowercase. Usado en lookups de tarifa
 * para que 'Asuncion', 'Asunción', 'asunción  ' matcheen entre si.
 * Lo que se guarda en DB sigue siendo el literal original (preferentemente
 * el string canonico del tarifa row que haya matcheado).
 */
export function normalizeCiudad(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
