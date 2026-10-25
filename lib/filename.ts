// Turn a document title into a safe download filename stem (no extension).
// Strips characters that are invalid on Windows/macOS/Linux, control and
// bidi/zero-width chars and leading dots, collapses whitespace/dashes,
// lowercases, limits length and falls back to "document" when nothing usable
// is left.

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

export function sanitizeFilename(
  title: string | null | undefined,
  fallback = 'document',
  maxLength = 60,
): string {
  let s = (title ?? '').normalize('NFC')
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
  s = s.replace(/[/\\:*?"<>|]/g, ' ')
  s = s.trim().replace(/\s+/g, '-').replace(/-{2,}/g, '-')
  s = s.replace(/^[.\-_\s]+/, '').toLowerCase()
  // Truncate by code point so surrogate pairs (emoji) aren't split.
  const chars = Array.from(s)
  if (chars.length > maxLength) s = chars.slice(0, maxLength).join('')
  s = s.replace(/[.\-\s]+$/, '')
  if (!s) return fallback
  if (RESERVED.test(s.split('.')[0])) s = `${s}-${fallback}`
  return s
}
