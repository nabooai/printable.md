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

  const scope = prepareCopy(source)
  const fragment = document.createDocumentFragment()
  fragment.appendChild(scope)
  const css = `${buildContentCss(fragment)}\n${TABLE_CSS}\n${pageCss}`
  freezeTableColumns(scope, host, css, contentWidth)
  fragment.appendChild(scope)

  const root = document.createElement('div')
  root.className = 'pp-pages-buffer'
  host.appendChild(root)

  const previewer: PreviewerT = new Previewer()
  let pages = 0
  let lastYield = performance.now()
  // Runs after every page: progress, cancellation, the page cap, and a
  // macrotask yield every ~40ms so typing/scrolling stay responsive (Paged.js
  // otherwise lays out the whole document in one long microtask chain).
  previewer.chunker.hooks.afterPageLayout.register(async () => {
    pages++
    if (signal.aborted) throw new PaginationAborted()
    if (pages > maxPages) throw new TooManyPages(maxPages)
    if (performance.now() - lastYield > 40) {
      onProgress?.(pages)
      await new Promise((r) => setTimeout(r, 0))
      lastYield = performance.now()
      if (signal.aborted) throw new PaginationAborted()
    }
  })

  previewer.chunker.hooks.renderNode.register(repeatTableHeader)

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
    return { pages: flow.total, ms: performance.now() - t0, root, setPrintable, destroy }
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
  box.appendChild(scope)
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
    box.remove()
    style.remove()
    scope.remove()
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
