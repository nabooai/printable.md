// Validation for settings persisted in localStorage. Stored values can be
// anything (old app versions, manual edits, other tabs, extensions), so every
// read goes through one of these normalizers: wrong shapes/types fall back to
// the defaults field by field, numbers are clamped to the slider ranges, and
// nothing here ever throws.
import type { PageSize, Theme, TypographySettings } from '@/components/print-document'

export const THEME_IDS = [
  'scientific',
  'editorial',
  'magazine',
  'newspaper',
  'hipster',
  'technical',
  'scholarly',
  'modernist',
  'brutalist',
  'zine',
  'manuscript',
  'minimal',
] as const satisfies readonly Theme[]

// Compile-time check that THEME_IDS lists every Theme.
type MissingTheme = Exclude<Theme, (typeof THEME_IDS)[number]>
const _allThemesListed: MissingTheme extends never ? true : MissingTheme = true
void _allThemesListed

export const PAGE_SIZES = ['letter', 'a4'] as const satisfies readonly PageSize[]

export const DEFAULT_THEME: Theme = 'scientific'
export const DEFAULT_PAGE_SIZE: PageSize = 'letter'

export const STORAGE_KEYS = {
  theme: 'pp:theme',
  pageSize: 'pp:pageSize',
  typography: 'pp:typo',
  keepHistory: 'pp:keepHistory',
} as const

/** Slider ranges in the Typography panel (app/page.tsx). Keep in sync. */
export const TYPO_RANGES: Record<
  'fontScale' | 'lineHeight' | 'paragraphSpacing' | 'letterSpacing' | 'pageMargin',
  { min: number; max: number }
> = {
  fontScale: { min: 0.75, max: 1.4 },
  lineHeight: { min: 1.2, max: 2.2 },
  paragraphSpacing: { min: 0.5, max: 2 },
  letterSpacing: { min: -0.04, max: 0.08 },
  pageMargin: { min: 0.6, max: 1.4 },
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback
}

export function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

export function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

export function str(v: unknown, fallback: string, maxLength = 500): string {
  return typeof v === 'string' ? v.slice(0, maxLength) : fallback
}

export const normalizeTheme = (v: unknown): Theme => oneOf(THEME_IDS, v, DEFAULT_THEME)
export const normalizePageSize = (v: unknown): PageSize => oneOf(PAGE_SIZES, v, DEFAULT_PAGE_SIZE)

export function normalizeTypography(v: unknown, defaults: TypographySettings): TypographySettings {
  const o = isRecord(v) ? v : {}
  const num = (k: keyof typeof TYPO_RANGES) =>
    clampNumber(o[k], TYPO_RANGES[k].min, TYPO_RANGES[k].max, defaults[k])
  return {
    fontScale: num('fontScale'),
    lineHeight: num('lineHeight'),
    paragraphSpacing: num('paragraphSpacing'),
    letterSpacing: num('letterSpacing'),
    pageMargin: num('pageMargin'),
    hyphenate: bool(o.hyphenate, defaults.hyphenate),
    // Optional override; anything else (incl. the old `justify` boolean) means
    // "use the theme's own alignment".
    ...(o.align === 'justify' || o.align === 'left' ? { align: o.align } : null),
  }
}
