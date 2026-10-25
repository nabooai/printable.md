'use client'

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { PageSize } from '@/components/print-document'
import { buildPagedPageRule, pageMargins, type PrintSettings } from '@/lib/print-settings'
import { SCOPE_CLASS } from '@/lib/paged/content-css'
import { loadPagedJs, paginate, PaginationAborted, TooManyPages, type Pagination } from '@/lib/paged/paginate'

/** Above this many pages the Pages view gives up and printing stays native. */
export const MAX_PAGES = 400
const DEBOUNCE_MS = 300
const PAGE_WIDTH_PX: Record<PageSize, number> = { letter: 816, a4: (210 / 25.4) * 96 }
const GUTTER_PX = 24

export interface PagesViewHandle {
  /**
   * Resolves once the pagination is up to date with the document: true when
   * printing will print these pages, false when it falls back to the
   * browser's own pagination (failed, too long, or empty).
   */
  ready(): Promise<boolean>
}

type Status =
  | { kind: 'loading' }
  | { kind: 'paginating'; pages: number }
  | { kind: 'ready'; pages: number; ms: number; overflow: number[] }
  | { kind: 'too-big' }
  | { kind: 'error'; message: string }

/**
 * Which layout window.print() uses. 'pages' prints the Paged.js page boxes
 * (preview == print); 'native' prints the normal sheet with the browser's
 * own fragmentation and the @page rule from usePrintStyles.
 */
function setPrintTarget(target: 'pages' | 'native', live: Pagination | null) {
  const pages = target === 'pages' && live !== null
  const html = document.documentElement
  if (pages) html.dataset.ppPrint = 'pages'
  else delete html.dataset.ppPrint
  live?.setPrintable(pages)
  // The native @page rule (edge band + padding on .page-paper) must not leak
  // into the paginated print, and vice versa (setPrintable above).
  const native = document.getElementById('pp-page-size-style') as HTMLStyleElement | null
  if (native) native.media = pages ? 'not all' : ''
}

export function PagesView({
  ref,
  printRoot,
  pageSize,
  marginScale,
  settings,
  docTitle,
  isEmpty,
}: {
  ref?: Ref<PagesViewHandle>
  /** #print-root — read (cloned) only, never modified. */
  printRoot: React.RefObject<HTMLElement | null>
  pageSize: PageSize
  marginScale: number
  settings: PrintSettings
  docTitle: string | null
  isEmpty: boolean
}) {
  const viewRef = useRef<HTMLDivElement>(null)
  // Imperatively managed: React renders it empty and never touches its
  // children. It holds up to two absolutely positioned buffers: the live one
  // (scaled with transform to fit the column) and, while re-paginating, a
  // staging one that Paged.js lays out unscaled and invisible (its
  // measurements must not see the transform). Swapping is an attribute flip,
  // not a DOM move, so the finished pages are never laid out twice.
  const hostRef = useRef<HTMLDivElement>(null)
  const liveObserver = useRef<ResizeObserver | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [scale, setScale] = useState(1)
  const [contentH, setContentH] = useState(0)

  const ctl = useRef({
    live: null as Pagination | null,
    abort: null as AbortController | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    stale: true,
    waiters: [] as ((ok: boolean) => void)[],
    /** Result for ready() when nothing is pending. */
    settled: false as boolean,
  })

  const settle = (ok: boolean) => {
    const c = ctl.current
    c.settled = ok
    const ws = c.waiters.splice(0)
    ws.forEach((w) => w(ok))
  }

  useImperativeHandle(ref, () => ({
    ready() {
      const c = ctl.current
      if (!c.stale && !c.abort && !c.timer) return Promise.resolve(c.settled)
      return new Promise<boolean>((resolve) => c.waiters.push(resolve))
    },
  }))

  const fit = useEffectEvent(() => {
    const view = viewRef.current
    if (!view) return
    const avail = view.clientWidth - 2 * GUTTER_PX
    setScale(Math.min(1, Math.max(0.2, avail / PAGE_WIDTH_PX[pageSize])))
  })

  const run = useEffectEvent(async () => {
    const c = ctl.current
    c.timer = null
    const source = printRoot.current?.querySelector('.print-stage')
    const host = hostRef.current
    if (!source || !host) return
    if (isEmpty) {
      c.live?.destroy()
      c.live = null
      c.stale = false
      setPrintTarget('native', null)
      setStatus({ kind: 'ready', pages: 0, ms: 0, overflow: [] })
      settle(false)
      return
    }
    const abort = new AbortController()
    c.abort = abort
    setStatus({ kind: 'paginating', pages: 0 })
    try {
      const result = await paginate({
        source,
        host,
        pageCss: buildPagedPageRule({ pageSize, marginScale, settings, docTitle, scope: `.${SCOPE_CLASS}` }),
        contentWidth: PAGE_WIDTH_PX[pageSize] - 2 * pageMargins(pageSize, marginScale).hPx,
        signal: abort.signal,
        maxPages: MAX_PAGES,
        onProgress: (pages) => setStatus({ kind: 'paginating', pages }),
      })
      if (abort.signal.aborted) {
        result.destroy()
        return
      }
      // Swap buffers, keeping the page at the top of the viewport in place.
      const anchor = pageAtTop(c.live?.root)
      c.live?.destroy()
      result.root.dataset.live = ''
      c.live = result
      liveObserver.current?.disconnect()
      liveObserver.current = new ResizeObserver(() => setContentH(result.root.offsetHeight))
      liveObserver.current.observe(result.root)
      flushSync(() => setContentH(result.root.offsetHeight))
      c.abort = null
      c.stale = false
      setPrintTarget('pages', result)
      setStatus({ kind: 'ready', pages: result.pages, ms: Math.round(result.ms), overflow: result.overflowPages })
      if (anchor) restoreAnchor(result.root, anchor)
      settle(true)
    } catch (e) {
      if (e instanceof PaginationAborted || abort.signal.aborted) return
      c.abort = null
      c.live?.destroy()
      c.live = null
      c.stale = false
      setPrintTarget('native', null)
      if (e instanceof TooManyPages) setStatus({ kind: 'too-big' })
      else {
        console.error('Pages view: pagination failed', e)
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
      settle(false)
    }
  })

  const schedule = useEffectEvent((delay: number) => {
    const c = ctl.current
    c.stale = true
    // Until the new pagination lands, a print uses the browser's layout of the
    // current document rather than outdated pages.
    setPrintTarget('native', c.live)
    // Dim the outdated pages right away, not only once the debounce ends.
    setStatus({ kind: 'paginating', pages: 0 })
    c.abort?.abort()
    c.abort = null
    if (c.timer) clearTimeout(c.timer)
    c.timer = setTimeout(() => void run(), delay)
  })

  // Mount: start loading the library, paginate, watch the rendered document.
  useEffect(() => {
    void loadPagedJs().catch(() => {})
    const c = ctl.current
    const root = printRoot.current
    const mo = new MutationObserver((records) => {
      const relevant = records.some((r) => {
        const t = r.target instanceof Element ? r.target : r.target.parentElement
        if (r.target === root) return false // paste-flash class on #print-root itself
        return !t?.closest('.page-furniture')
      })
      if (relevant) schedule(DEBOUNCE_MS)
    })
    if (root) mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
    // (No re-run on web-font loads: Paged.js loads every font before layout.)
    const ro = new ResizeObserver(() => fit())
    if (viewRef.current) ro.observe(viewRef.current)
    return () => {
      mo.disconnect()
      ro.disconnect()
      liveObserver.current?.disconnect()
      if (c.timer) clearTimeout(c.timer)
      c.timer = null
      c.abort?.abort()
      c.abort = null
      c.live?.destroy()
      c.live = null
      c.stale = true
      setPrintTarget('native', null)
      settle(false)
    }
  }, [printRoot])

  // Settings that aren't visible in the rendered DOM (furniture, page size, margins).
  useEffect(() => {
    schedule(ctl.current.live ? DEBOUNCE_MS : 0)
    fit()
  }, [pageSize, marginScale, settings, docTitle, isEmpty])

  // Print button / shortcut call ready() first; this covers the browser menu
  // and anything else: if the pages are not current, print natively.
  useEffect(() => {
    const before = () => {
      const c = ctl.current
      setPrintTarget(c.stale ? 'native' : 'pages', c.stale ? null : c.live)
    }
    window.addEventListener('beforeprint', before)
    return () => window.removeEventListener('beforeprint', before)
  }, [])

  // Remote-image chips in the copy have no React handlers: forward clicks to
  // the matching chip in the real document (which re-paginates once loaded).
  const onClick = (e: React.MouseEvent) => {
    const chip = (e.target as Element).closest('.remote-image-chip')
    const host = hostRef.current
    if (!chip || !host) return
    const live = host.querySelector('.pp-pages-buffer[data-live]')
    const idx = live ? Array.from(live.querySelectorAll('.remote-image-chip')).indexOf(chip) : -1
    const target = printRoot.current?.querySelectorAll<HTMLElement>('.remote-image-chip')[idx]
    target?.click()
  }

  const pageW = PAGE_WIDTH_PX[pageSize]
  const busy = status.kind === 'paginating' || status.kind === 'loading'

  return (
    <div
      ref={viewRef}
      className="pages-view"
      data-busy={busy ? '' : undefined}
      data-pages={status.kind === 'ready' ? status.pages : undefined}
      data-ms={status.kind === 'ready' ? status.ms : undefined}
      data-overflow={status.kind === 'ready' ? status.overflow.join(' ') : undefined}
    >
      <div className="pages-view__status no-print" role="status" aria-live="polite">
        {status.kind === 'loading' && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading page layout…
          </>
        )}
        {status.kind === 'paginating' && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Paginating…
            {status.pages > 0 ? ` ${status.pages} pages` : ''}
          </>
        )}
        {status.kind === 'ready' &&
          (status.pages === 0 ? (
            <span>Nothing to paginate yet.</span>
          ) : (
            <span>
              {status.pages} {status.pages === 1 ? 'page' : 'pages'} — printing prints exactly these pages
            </span>
          ))}
        {status.kind === 'too-big' && (
          <span>
            Longer than {MAX_PAGES} pages — too long to lay out here. Use Preview; printing uses the browser&rsquo;s
            own page breaks.
          </span>
        )}
        {status.kind === 'error' && (
          <span>Couldn&rsquo;t lay out pages ({status.message}). Printing uses the browser&rsquo;s own page breaks.</span>
        )}
      </div>
      <div
        ref={hostRef}
        className="pages-view__frame"
        onClick={onClick}
        style={{ width: pageW * scale, height: contentH * scale, '--pp-pages-scale': scale } as React.CSSProperties}
      />
    </div>
  )
}

function pageAtTop(root: HTMLElement | undefined) {
  if (!root) return null
  const pages = root.querySelectorAll<HTMLElement>('.pagedjs_page')
  for (let i = 0; i < pages.length; i++) {
    const r = pages[i].getBoundingClientRect()
    if (r.bottom > 100) return { index: i, top: r.top }
  }
  return null
}

function restoreAnchor(root: HTMLElement, anchor: { index: number; top: number }) {
  const pages = root.querySelectorAll<HTMLElement>('.pagedjs_page')
  const page = pages[Math.min(anchor.index, pages.length - 1)]
  if (!page) return
  window.scrollBy(0, page.getBoundingClientRect().top - anchor.top)
}
