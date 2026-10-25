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
//  - string-set / running() are unsupported natively, so in native print the
//    header text is a literal. The Pages view (Paged.js, see lib/paged/)
//    paginates itself and does support string-set: buildPagedPageRule() adds
//    the "Current section" running header there.
import type { PageSize } from '@/components/print-document'
import { bool, isRecord, oneOf, str } from '@/lib/settings'

export type PageNumberPosition = 'bottom-center' | 'bottom-right' | 'top-right'
export type PageNumberFormat = 'n' | 'n-of-total' | 'page-n-of-total'
export type HeaderMode = 'off' | 'title' | 'section' | 'custom'

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

const POSITIONS = ['bottom-center', 'bottom-right', 'top-right'] as const satisfies readonly PageNumberPosition[]
const FORMATS = ['n', 'n-of-total', 'page-n-of-total'] as const satisfies readonly PageNumberFormat[]
const HEADER_MODES = ['off', 'title', 'section', 'custom'] as const satisfies readonly HeaderMode[]

/**
 * Validate a stored (possibly old, partial or corrupt) value field by field;
 * anything missing or of the wrong type falls back to the default. Never throws.
 */
export function normalizePrintSettings(v: unknown): PrintSettings {
  const o = isRecord(v) ? v : {}
  const d = DEFAULT_PRINT
  return {
    pageNumbers: bool(o.pageNumbers, d.pageNumbers),
    pageNumberPosition: oneOf(POSITIONS, o.pageNumberPosition, d.pageNumberPosition),
    pageNumberFormat: oneOf(FORMATS, o.pageNumberFormat, d.pageNumberFormat),
    header: oneOf(HEADER_MODES, o.header, d.header),
    headerText: str(o.headerText, d.headerText),
    footerText: str(o.footerText, d.footerText),
    skipFirstPage: bool(o.skipFirstPage, d.skipFirstPage),
  }
}

// Base page margins at a 100% "Page margin" slider. Must match the screen
// sheet's padding in globals.css (.page-paper / .print-stage .page-paper).
//
// Chrome's print dialog overrides @page margins unless "Margins: Default" is
// picked (and the choice is sticky). So the @page margin is kept small and the
// rest of each margin is padding on the sheet, repeated on every printed page
// via box-decoration-break: clone — the Page margin slider applies whatever
// the dialog says. Margin-box furniture lives in the top/bottom edge band,
// which is 0.5in deep so it stays clear of printers' unprintable border
// (~4-5mm); a 0.25in band put page numbers where real printers clip them.
const EDGE_V_IN = 0.5
const EDGE_H_IN = 0.25
const BASE_MARGIN: Record<PageSize, { v: number; h: number; unit: 'in' | 'mm'; pageH: number }> = {
  letter: { v: 0.85, h: 0.95, unit: 'in', pageH: 11 },
  a4: { v: 22, h: 24, unit: 'mm', pageH: 297 },
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function pageMargins(pageSize: PageSize, scale: number) {
  const b = BASE_MARGIN[pageSize]
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const toPx = b.unit === 'in' ? 96 : 96 / 25.4
  const inUnit = (inches: number) => (b.unit === 'in' ? inches : inches * 25.4)
  return {
    css: `${round(b.v * s)}${b.unit} ${round(b.h * s)}${b.unit}`,
    /** vertical / horizontal margin in CSS px */
    vPx: b.v * s * toPx,
    hPx: b.h * s * toPx,
    /** printable content height of one page in CSS px */
    contentPx: (b.pageH - 2 * b.v * s) * toPx,
    /** top/bottom @page margin (the band holding margin-box furniture), in CSS px */
    edgePx: EDGE_V_IN * 96,
    /** print padding on the sheet: the margin minus the edge band (never negative) */
    padCss: `${round(Math.max(0, b.v * s - inUnit(EDGE_V_IN)))}${b.unit} ${round(b.h * s - inUnit(EDGE_H_IN))}${b.unit}`,
    hPadCss: `${round(b.h * s - inUnit(EDGE_H_IN))}${b.unit}`,
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

/**
 * Literal header text. "Current section" can only be resolved per page by the
 * Pages view; everywhere else (native print, the sheet preview) it falls back
 * to the document title.
 */
export function headerText(s: PrintSettings, docTitle: string | null): string {
  if (s.header === 'title' || s.header === 'section') return (docTitle ?? '').trim()
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
const BOXES: readonly Box[] = ['top-left', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']

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
    `@page { size: ${size}; margin: ${EDGE_V_IN}in ${EDGE_H_IN}in; }`,
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

/** Named string the Pages view sets from each top-level H2 (CSS string-set). */
export const SECTION_STRING = 'pp-section'

/**
 * @page CSS for the Pages view (Paged.js). Unlike native print there is no
 * fixed edge band + padding trick: Paged.js lays out real page boxes, and the
 * printed @page becomes `margin: 0` with one page box per sheet, so the full
 * margin is a true @page margin here. Margin-box text sits in the outer 0.5in
 * of the margin, like native print (see pagedFurnitureCss in lib/paged).
 *
 * Selectors for string-set are scoped like the rest of the paginated copy.
 */
export function buildPagedPageRule(opts: {
  pageSize: PageSize
  marginScale: number
  settings: PrintSettings
  docTitle: string | null
  scope: string
}): string {
  const { pageSize, marginScale, settings, docTitle, scope } = opts
  const size = pageSize === 'a4' ? 'A4' : 'letter'
  const { css: margin } = pageMargins(pageSize, marginScale)
  const boxes = furnitureBoxes(settings, docTitle)
  const lines = [`@page { size: ${size}; margin: ${margin}; }`]
  if (settings.header === 'section') {
    // The document title seeds the string, then every top-level H2 replaces
    // it. string() without a keyword is `first`: the first heading that
    // starts on the page, else the one carried over from earlier pages.
    lines.push(
      `${scope} .doc-title, ${scope} .prose-print > h2 { string-set: ${SECTION_STRING} content(text); }`,
    )
    boxes['top-left'] = `string(${SECTION_STRING})`
  }
  const used = BOXES.filter((b) => boxes[b])
  if (used.length > 0) {
    const body = used
      .map((b) => {
        const align = b.endsWith('right') ? 'right' : b.endsWith('center') ? 'center' : 'left'
        return `@${b} { content: ${boxes[b]}; ${BOX_STYLE} text-align: ${align}; }`
      })
      .join(' ')
    lines.push(`@page { ${body} }`)
    if (settings.skipFirstPage) {
      lines.push(`@page :first { ${used.map((b) => `@${b} { content: none; }`).join(' ')} }`)
    }
  }
  return lines.join('\n')
}
