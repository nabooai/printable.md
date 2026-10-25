// Print "furniture" (page numbers, running header, footer) and the @page rule
// that carries it. Pure helpers — no React — so they're easy to reason about.
//
// Chrome 131+ supports CSS @page margin boxes (@top-left, @bottom-center, …)
// with counter(page) / counter(pages). Things that matter here:
//  - CSS custom properties only resolve inside @page when set on :root, so
//    margins and strings are written straight into the generated rule and the
//    theme font/colour are set as vars on document.documentElement.
//  - Chrome hides its own "Headers and footers" on an edge as soon as a margin
//    box on that edge has content — even `content: ""`. `content: none` does
//    NOT count, so empty boxes use "" to keep the browser's defaults away.
//  - string-set / running() are unsupported, so header text is a literal.
import type { PageSize } from '@/components/print-document'

export type PageNumberPosition = 'bottom-center' | 'bottom-right' | 'top-right'
export type PageNumberFormat = 'n' | 'n-of-total' | 'page-n-of-total'
export type HeaderMode = 'off' | 'title' | 'custom'

export interface PrintSettings {
  pageNumbers: boolean
  pageNumberPosition: PageNumberPosition
  pageNumberFormat: PageNumberFormat
  header: HeaderMode
  headerText: string
  footerText: string
  skipFirstPage: boolean
}

export const DEFAULT_PRINT: PrintSettings = {
  pageNumbers: true,
  pageNumberPosition: 'bottom-center',
  pageNumberFormat: 'n-of-total',
  header: 'off',
  headerText: '',
  footerText: '',
  skipFirstPage: true,
}

export const PRINT_STORAGE_KEY = 'pp:print'

/** Fill in any fields missing from an older/partial stored value. */
export function normalizePrintSettings(v: Partial<PrintSettings> | null | undefined): PrintSettings {
  return { ...DEFAULT_PRINT, ...(v && typeof v === 'object' ? v : {}) }
}

// Base page margins at a 100% "Page margin" slider. Must match the screen
// sheet's padding in globals.css (.page-paper / .print-stage .page-paper).
//
// Chrome's print dialog overrides @page margins unless "Margins: Default" is
// picked (and the choice is sticky). So the @page margin is pinned to Chrome's
// "Minimum" (0.25in) and the rest of each margin is padding on the sheet,
// repeated on every printed page via box-decoration-break: clone. Default and
// Minimum then print identically and the Page margin slider always applies.
// Margin-box furniture lives in that 0.25in edge band.
const EDGE_IN = 0.25
const BASE_MARGIN: Record<PageSize, { v: number; h: number; unit: 'in' | 'mm'; pageH: number }> = {
  letter: { v: 0.85, h: 0.95, unit: 'in', pageH: 11 },
  a4: { v: 22, h: 24, unit: 'mm', pageH: 297 },
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function pageMargins(pageSize: PageSize, scale: number) {
  const b = BASE_MARGIN[pageSize]
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const toPx = b.unit === 'in' ? 96 : 96 / 25.4
  const edge = b.unit === 'in' ? EDGE_IN : EDGE_IN * 25.4
  return {
    css: `${round(b.v * s)}${b.unit} ${round(b.h * s)}${b.unit}`,
    /** vertical / horizontal margin in CSS px */
    vPx: b.v * s * toPx,
    hPx: b.h * s * toPx,
    /** printable content height of one page in CSS px */
    contentPx: (b.pageH - 2 * b.v * s) * toPx,
    /** fixed @page margin (the edge band holding margin-box furniture), in CSS px */
    edgePx: EDGE_IN * 96,
    /** print padding on the sheet: the margin minus the edge band */
    padCss: `${round(b.v * s - edge)}${b.unit} ${round(b.h * s - edge)}${b.unit}`,
    hPadCss: `${round(b.h * s - edge)}${b.unit}`,
  }
}

/** Quote arbitrary text as a CSS string token. */
export function cssString(text: string): string {
  const clean = text
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return `"${clean}"`
}

export function headerText(s: PrintSettings, docTitle: string | null): string {
  if (s.header === 'title') return (docTitle ?? '').trim()
  if (s.header === 'custom') return s.headerText.trim()
  return ''
}

/** Plain-text page number, for the on-screen preview. */
export function formatPageNumber(fmt: PageNumberFormat, n: number, total: number): string {
  if (fmt === 'n') return `${n}`
  if (fmt === 'page-n-of-total') return `Page ${n} of ${total}`
  return `${n} / ${total}`
}

function pageNumberContent(fmt: PageNumberFormat): string {
  if (fmt === 'n') return 'counter(page)'
  if (fmt === 'page-n-of-total') return '"Page " counter(page) " of " counter(pages)'
  return 'counter(page) " / " counter(pages)'
}

type Box = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** Which margin box shows what. Header → top-left, footer text → bottom-left. */
export function furnitureBoxes(s: PrintSettings, docTitle: string | null): Partial<Record<Box, string>> {
  const boxes: Partial<Record<Box, string>> = {}
  const hdr = headerText(s, docTitle)
  if (hdr) boxes['top-left'] = cssString(hdr)
  const ftr = s.footerText.trim()
  if (ftr) boxes['bottom-left'] = cssString(ftr)
  if (s.pageNumbers) boxes[s.pageNumberPosition] = pageNumberContent(s.pageNumberFormat)
  return boxes
}

export function hasFurniture(s: PrintSettings, docTitle: string | null): boolean {
  return Object.keys(furnitureBoxes(s, docTitle)).length > 0
}

const BOX_STYLE =
  'font-family: var(--pp-run-font, serif); font-size: 8.5pt; color: var(--pp-run-color, #666);' +
  ' font-style: normal; font-weight: 400; letter-spacing: 0.02em; font-variant-numeric: tabular-nums;'

/**
 * The full `@media print { @page … }` text: page size, margins scaled by the
 * Page margin slider, and (when supported) margin-box furniture.
 */
export function buildPageRule(opts: {
  pageSize: PageSize
  marginScale: number
  settings: PrintSettings
  docTitle: string | null
  marginBoxes: boolean
}): string {
  const { pageSize, marginScale, settings, docTitle, marginBoxes } = opts
  const size = pageSize === 'a4' ? 'A4' : 'letter'
  const { padCss, hPadCss } = pageMargins(pageSize, marginScale)
  const lines = [
    `@page { size: ${size}; margin: ${EDGE_IN}in; }`,
    `.print-stage .page-paper { padding: ${padCss} !important; box-decoration-break: clone; -webkit-box-decoration-break: clone; }`,
  ]

  const boxes = marginBoxes ? furnitureBoxes(settings, docTitle) : {}
  const used = Object.keys(boxes) as Box[]
  if (used.length > 0) {
    // Occupy one box on each edge (with "" if needed) so the browser's own
    // header/footer (URL, date, title) never collides with ours.
    const all: Partial<Record<Box, string>> = { ...boxes }
    if (!all['top-left'] && !all['top-right']) all['top-left'] = '""'
    if (!all['bottom-left'] && !all['bottom-center'] && !all['bottom-right']) all['bottom-left'] = '""'
    const names = Object.keys(all) as Box[]
    const body = names
      .map((b) => {
        const align = b.endsWith('right') ? 'right' : b.endsWith('center') ? 'center' : 'left'
        // Inset from the edge band's ends so the text lines up with the text column.
        const inset = align === 'right' ? `padding-right: ${hPadCss};` : align === 'left' ? `padding-left: ${hPadCss};` : ''
        return `@${b} { content: ${all[b]}; ${BOX_STYLE} text-align: ${align}; ${inset} }`
      })
      .join(' ')
    lines.push(`@page { ${body} }`)
    if (settings.skipFirstPage) {
      lines.push(`@page :first { ${names.map((b) => `@${b} { content: ""; }`).join(' ')} }`)
    }
  }
  return `@media print {\n  ${lines.join('\n  ')}\n}`
}
