// Paginate a detached copy of the rendered document with Paged.js.
//
// The React tree is never touched: the source element is deep-cloned, the
// clone is handed to Paged.js, and Paged.js renders its page boxes into a
// host element that React leaves alone (an empty div we own imperatively).
// Paged.js itself is loaded with a dynamic import, so it is a separate chunk
// fetched only when the Pages view opens.
import type { Previewer as PreviewerT } from 'pagedjs'
import { buildContentCss, SCOPE_CLASS } from '@/lib/paged/content-css'

export class PaginationAborted extends Error {
  constructor() {
    super('Pagination aborted')
    this.name = 'PaginationAborted'
  }
}

export class TooManyPages extends Error {
  constructor(public readonly limit: number) {
    super(`More than ${limit} pages`)
    this.name = 'TooManyPages'
  }
}

export interface Pagination {
  pages: number
  /** Wall-clock time from start to last page, ms. */
  ms: number
  /** The element holding Paged.js's `.pagedjs_pages`. */
  root: HTMLElement
  /** Page numbers whose content overflowed the page box (clipped). Should be empty. */
  overflowPages: number[]
  /**
   * Paged.js's <style> elements live in <head> and include print rules
   * (`@page { margin: 0 }`, html/body sizing). They stay screen-only unless
   * this pagination is the one being printed.
   */
  setPrintable(on: boolean): void
  destroy(): void
}

let loader: Promise<typeof import('pagedjs')> | null = null
/** Start fetching the Paged.js chunk (idempotent). */
export function loadPagedJs() {
  loader ??= import('pagedjs').catch((e) => {
    loader = null
    throw e
  })
  return loader
}

const ID_PREFIX = 'pg-'

/** Deep copy of the rendered document, prepared for pagination. */
function prepareCopy(source: Element): HTMLElement {
  const scope = document.createElement('div')
  scope.className = SCOPE_CLASS
  const copy = source.cloneNode(true) as Element
  // Screen-only decoration inside the sheet (approximate break guides etc.).
  copy.querySelectorAll('.page-furniture').forEach((n) => n.remove())
  // Ids must stay unique in the document: the React copy keeps the originals.
  copy.querySelectorAll('[id]').forEach((n) => (n.id = ID_PREFIX + n.id))
  copy.querySelectorAll('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute('href')!
    if (href.length > 1) a.setAttribute('href', `#${ID_PREFIX}${href.slice(1)}`)
  })
  scope.appendChild(copy)
  return scope
}

export async function paginate(opts: {
  source: Element
  host: HTMLElement
  /** @page rules (size, margins, margin boxes) plus any Pages-only CSS. */
  pageCss: string
  /** Width of the page content box in CSS px (page width minus side margins). */
  contentWidth: number
  signal: AbortSignal
  maxPages: number
  onProgress?: (pages: number) => void
}): Promise<Pagination> {
  const { source, host, pageCss, contentWidth, signal, maxPages, onProgress } = opts
  const t0 = performance.now()
  const { Previewer } = await loadPagedJs()
  if (signal.aborted) throw new PaginationAborted()

  // Preparation is split into steps with a yield between them, so a big
  // document doesn't block input for one long task.
  const step = async () => {
    await new Promise((r) => setTimeout(r, 0))
    if (signal.aborted) throw new PaginationAborted()
  }
  performance.mark('pp:paginate:start')
  const scope = prepareCopy(source)
  const fragment = document.createDocumentFragment()
  fragment.appendChild(scope)
  await step()
  const css = `${buildContentCss(fragment)}\n${TABLE_CSS}\n${pageCss}`
  await step()
  freezeTableColumns(scope, host, css, contentWidth)
  await step()
  performance.mark('pp:paginate:prepared')

  const root = document.createElement('div')
  root.className = 'pp-pages-buffer'
  host.appendChild(root)

  // hyphenGlyph: when Paged.js splits a word at the browser's auto-hyphenation
  // point it re-adds the hyphen as text. Its default U+2011 is missing from
  // most fonts; the fallback font's wider glyph / taller line could rewrap the
  // line past the page bottom. U+002D is in every font.
  const previewer: PreviewerT = new Previewer({ hyphenGlyph: '-' })
  let pages = 0
  let lastYield = performance.now()
  const overflowPages: number[] = []
  previewer.chunker.hooks.afterOverflowRemoved.register(keepFragmentInsidePage)
  previewer.chunker.hooks.beforeRenderResult.register((breakToken: BreakTokenLike | undefined, wrapper: HTMLElement, layout: LayoutLike) =>
    moveMissedOverflow(breakToken, wrapper, layout, previewer.chunker.source),
  )
  // Runs after every page: overflow check, progress, cancellation, the page
  // cap, and a macrotask yield every ~40ms so typing/scrolling stay
  // responsive (Paged.js otherwise lays out the whole document in one long
  // microtask chain).
  previewer.chunker.hooks.afterPageLayout.register(async (page: HTMLElement) => {
    pages++
    // Content that doesn't fit lands in an off-page CSS column: invisible on
    // screen and clipped in print. Record it rather than lose text silently.
    const area = page.querySelector<HTMLElement>('.pagedjs_page_content')
    if (area && firstOverflowingText(area)) {
      overflowPages.push(pages)
      console.warn(`Pages view: content overflows page ${pages}`)
    }
    if (signal.aborted) throw new PaginationAborted()
    if (pages > maxPages) throw new TooManyPages(maxPages)
    if (performance.now() - lastYield > 40) {
      onProgress?.(pages)
      await new Promise((r) => setTimeout(r, 0))
      lastYield = performance.now()
      if (signal.aborted) throw new PaginationAborted()
    }
  })

  previewer.chunker.hooks.renderNode.register(repeatTableHeader, restoreSkippedWhitespace)

  const styles = () => [previewer.polisher.styleEl, ...previewer.polisher.inserted].filter(Boolean)
  const setPrintable = (on: boolean) => {
    for (const s of styles()) s.media = on ? 'all' : 'screen'
  }
  const destroy = () => {
    try {
      previewer.chunker.stop()
      previewer.polisher.destroy()
    } catch {
      // Partially initialised; fall through to DOM cleanup.
    }
    root.remove()
  }

  // Paged.js inserts its <style>s as it goes; keep them screen-only from the start.
  const mo = new MutationObserver(() => setPrintable(false))
  mo.observe(document.head, { childList: true })
  try {
    // The CSS is passed inline ({ url: text }) so Paged.js never fetch()es.
    const flow = await previewer.preview(fragment, [{ [location.href]: css }], root)
    if (signal.aborted) throw new PaginationAborted()
    setPrintable(false)
    performance.mark('pp:paginate:done')
    return { pages: flow.total, ms: performance.now() - t0, root, overflowPages, setPrintable, destroy }
  } catch (e) {
    destroy()
    throw e
  } finally {
    mo.disconnect()
  }
}

// ---- Tables -------------------------------------------------------------

const FIXED_ATTR = 'data-pp-fixed'
const REPEAT_ATTR = 'data-pp-repeat'
const TABLE_CSS = `.${SCOPE_CLASS} table[${FIXED_ATTR}] { table-layout: fixed; }`

/**
 * Paged.js lays out each page's piece of a split table as its own table, so
 * automatic column sizing would give every page different columns. Measure
 * the whole table once (in the print cascade, at the page's content width) and
 * pin those widths as percentages with table-layout: fixed. Attributes, not
 * inline styles: Paged.js treats any element with a style attribute as
 * "undisplayed" when looking for break neighbours.
 */
function freezeTableColumns(scope: HTMLElement, host: HTMLElement, css: string, width: number) {
  const tables = Array.from(scope.querySelectorAll('table'))
  if (tables.length === 0) return
  const style = document.createElement('style')
  style.textContent = css.replace(/@page[^{]*\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '')
  const box = document.createElement('div')
  box.style.cssText = `position:absolute;left:0;top:0;width:${width}px;visibility:hidden;pointer-events:none`
  // Lay out only the tables: each is moved (with a placeholder left behind)
  // into a shallow copy of its ancestor chain, so the cascade it sees is the
  // same as in the document.
  const placeholders = tables.map((table) => {
    const mark = document.createComment('')
    const chain: Element[] = []
    for (let a = table.parentElement; a && a !== scope.parentElement; a = a.parentElement) chain.unshift(a)
    let parent: Element = box
    for (const a of chain) parent = parent.appendChild(a.cloneNode(false) as Element)
    table.replaceWith(mark)
    parent.appendChild(table)
    return mark
  })
  document.head.appendChild(style)
  host.appendChild(box)
  try {
    for (const table of tables) {
      const tableWidth = table.getBoundingClientRect().width
      // The row with the most cells and no colspans defines the columns.
      let best: HTMLTableCellElement[] = []
      for (const row of Array.from(table.rows)) {
        const cells = Array.from(row.cells)
        if (cells.length > best.length && cells.every((c) => c.colSpan === 1)) best = cells
      }
      if (!tableWidth || best.length < 2) continue
      const widths = best.map((c) => c.getBoundingClientRect().width)
      table.querySelectorAll(':scope > colgroup').forEach((c) => c.remove())
      const colgroup = document.createElement('colgroup')
      for (const w of widths) {
        const col = document.createElement('col')
        col.setAttribute('width', `${((w / tableWidth) * 100).toFixed(3)}%`)
        colgroup.appendChild(col)
      }
      table.insertBefore(colgroup, table.firstChild)
      table.setAttribute(FIXED_ATTR, '')
    }
  } finally {
    tables.forEach((table, i) => placeholders[i].replaceWith(table))
    box.remove()
    style.remove()
  }
}

/**
 * Paged.js 0.4 rebuilds a split table on the next page as a bare <table>:
 * no <colgroup> (so the frozen column widths would be lost) and no header
 * row (Chrome's native print repeats <thead>). When a continued table is
 * started on a page, copy both back in. This runs while the page is being
 * filled, before overflow is measured, so the header counts towards the
 * page's height.
 */
function repeatTableHeader(clone: Node, node: Node) {
  const el = clone instanceof Element ? clone : clone.parentElement
  const table = el?.closest('table')
  if (!table || !table.hasAttribute('data-split-from') || table.hasAttribute(REPEAT_ATTR)) return
  table.setAttribute(REPEAT_ATTR, '')
  const source = (node instanceof Element ? node : node.parentElement)?.closest('table')
  if (!source) return
  // Copies are outside the flow Paged.js tracks: no refs, so it never breaks at them.
  const copy = (n: Element) => {
    const c = n.cloneNode(true) as Element
    c.removeAttribute('data-ref')
    c.querySelectorAll('[data-ref]').forEach((x) => x.removeAttribute('data-ref'))
    return c
  }
  const thead = source.querySelector(':scope > thead')
  if (thead && !table.querySelector(':scope > thead')) table.insertBefore(copy(thead), table.firstChild)
  const colgroup = source.querySelector(':scope > colgroup')
  if (colgroup && !table.querySelector(':scope > colgroup')) table.insertBefore(copy(colgroup), table.firstChild)
}

// ---- Hyphen at a split word ---------------------------------------------

/**
 * Runs right after Paged.js cuts a page's overflow and (maybe) appended a
 * hyphen to the last word. Code never gets one (a split identifier is not a
 * hyphenated word), and if the hyphen makes the fragment overflow again the
 * text would end up in the clipped off-page column, so it is taken back out.
 */
function keepFragmentInsidePage(_removed: unknown, rendered: HTMLElement, layout: { hasOverflow(el: Element): boolean }) {
  const marked = rendered.querySelectorAll('.pagedjs_hyphen')
  const el = marked[marked.length - 1]
  if (!el) return
  if (!el.closest('pre, code') && !layout.hasOverflow(rendered)) return
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n as Text
  if (last?.data.endsWith('-')) last.data = last.data.slice(0, -1)
  el.classList.remove('pagedjs_hyphen')
}

// ---- Overflow Paged.js missed ------------------------------------------

interface BreakTokenLike {
  node: Node
  offset: number
}
interface LayoutLike {
  createBreakToken(overflow: Range, rendered: Element, source: unknown): BreakTokenLike | undefined
  removeOverflow(overflow: Range): unknown
}

/**
 * A page's content box is a CSS multi-column container; whatever doesn't fit
 * flows into a column far to the right (Paged.js uses a >1000px gap), which
 * is invisible and never printed.
 */
function overflowsIntoNextColumn(area: HTMLElement) {
  return area.scrollWidth > area.clientWidth + 500
}

/**
 * Paged.js 0.4 sometimes misses a line that overflows into the next column
 * (e.g. its text-break search treats a break at offset 0 of a text node as
 * "no break"), ending the page with that text in the invisible column, and
 * the next page starts after it, so the text would be lost from both the
 * preview and the print. Before the page's result is returned, find the
 * first text in the overflow column, cut there, and move the page's break
 * token to it so the text starts the next page.
 */
function moveMissedOverflow(breakToken: BreakTokenLike | undefined, wrapper: HTMLElement, layout: LayoutLike, source: unknown) {
  const area = wrapper.parentElement
  if (!breakToken || !area) return
  const hit = firstOverflowingText(area)
  if (!hit) return
  const range = document.createRange()
  range.setStart(hit.node, hit.offset)
  range.setEndAfter(wrapper.lastChild!)
  const token = layout.createBreakToken(range, wrapper, source)
  if (!token?.node) return
  layout.removeOverflow(range)
  breakToken.node = token.node
  breakToken.offset = token.offset
}

/**
 * The first visible character laid out in the overflow column, if any (empty
 * ancestor boxes spilling a pixel or two over are harmless and ignored).
 */
function firstOverflowingText(area: HTMLElement): { node: Text; offset: number } | null {
  if (!overflowsIntoNextColumn(area)) return null
  const right = area.getBoundingClientRect().right
  const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.data.trim()) continue
    range.selectNodeContents(n)
    if (!Array.from(range.getClientRects()).some((r) => r.width > 0 && r.left >= right)) continue
    // First character that sits in the overflow column (always a line start).
    for (let i = 0; i < n.data.length; i++) {
      range.setStart(n, i)
      range.setEnd(n, i + 1)
      const r = range.getBoundingClientRect()
      if (r.width > 0 && r.left >= right) return { node: n, offset: i }
    }
    return { node: n, offset: 0 }
  }
  return null
}

// ---- Whitespace between inline elements --------------------------------

// Paged.js 0.4's isContainer(): elements it clones whole instead of walking.
const WHOLE = new Set(
  ('A ABBR ACRONYM B BDO BIG BR BUTTON CITE CODE DFN EM I IMG INPUT KBD LABEL MAP OBJECT Q SAMP SCRIPT SELECT ' +
    'SMALL SPAN STRONG SUB SUP TEXTAREA TIME TT VAR P H1 H2 H3 H4 H5 H6 FIGCAPTION BLOCKQUOTE PRE LI TD DT DD ' +
    'VIDEO CANVAS').split(' '),
)
// Parents whose whitespace-only children are insignificant (between blocks).
const BLOCK_PARENTS = new Set(
  'DIV SECTION ARTICLE HEADER FOOTER MAIN NAV ASIDE UL OL DL TABLE THEAD TBODY TFOOT TR FIGURE DETAILS BODY'.split(' '),
)

/**
 * Paged.js 0.4 bug: after cloning an element whole, the layout walk moves on
 * with nodeAfter(), which skips whitespace-only text nodes. While a split
 * block is being continued on a new page (the walk goes inside the <pre> or
 * <p>), that drops the whitespace between two inline elements: the newline
 * and indent before a highlighted `def`, the space in "`a` `b`". Put the
 * skipped whitespace back right after the clone; the rendered DOM then
 * mirrors the source again (which Paged.js's text-node indexing assumes).
 */
function restoreSkippedWhitespace(clone: Node, node: Node) {
  if (!(node instanceof Element) || !WHOLE.has(node.tagName)) return
  const parent = node.parentElement
  if (!parent || BLOCK_PARENTS.has(parent.tagName) || !clone.parentNode) return
  const next = node.nextSibling
  if (!(next instanceof Text) || /[^\t\n\r ]/.test(next.data) || !next.data) return
  // Only when Paged.js will skip it: there is a significant node after it.
  let after = next.nextSibling
  while (after instanceof Text && !/[^\t\n\r ]/.test(after.data)) after = after.nextSibling
  if (!after) return
  clone.parentNode.insertBefore(document.createTextNode(next.data), clone.nextSibling)
}
