/**
 * Convierte un progressionKey o goal-id a nombre legible para el usuario.
 * Ej: "goal-guitarra-clasica" → "Guitarra Clasica"
 */
export function humanize(value: string): string {
  return value
    .replace(/^goal-/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
