'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { BookMarked } from 'lucide-react'
import type { PageSize, Theme } from '@/components/print-document'
import {
  buildPageRule,
  FURNITURE_CENTER_IN,
  formatPageNumber,
  headerText,
  pageMargins,
  type HeaderMode,
  type PageNumberFormat,
  type PageNumberPosition,
  type PrintSettings,
} from '@/lib/print-settings'

const noopSubscribe = () => () => {}

/** True when the browser supports CSS @page margin boxes (Chrome/Edge 131+). */
export function useMarginBoxSupport(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== 'undefined' && 'CSSMarginRule' in window,
    () => false,
  )
}

/**
 * Keeps the injected <style id="pp-page-size-style"> (page size, margins,
 * margin-box furniture) and the :root vars it reads (theme font + muted ink)
 * in sync with the current settings.
 */
export function usePrintStyles(opts: {
  pageSize: PageSize
  marginScale: number
  settings: PrintSettings
  docTitle: string | null
  theme: Theme
  marginBoxes: boolean
}) {
  const { pageSize, marginScale, settings, docTitle, theme, marginBoxes } = opts

  useEffect(() => {
    const styleId = 'pp-page-size-style'
    let el = document.getElementById(styleId) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = styleId
      document.head.appendChild(el)
    }
    el.textContent = buildPageRule({ pageSize, marginScale, settings, docTitle, marginBoxes })
  }, [pageSize, marginScale, settings, docTitle, marginBoxes])

  // @page margin boxes can only see custom properties on :root, so copy the
  // active theme's body font and a muted version of its ink colour there.
  useEffect(() => {
    const sync = () => {
      const prose = document.querySelector('.prose-print')
      if (!prose) return
      const cs = getComputedStyle(prose)
      const root = document.documentElement.style
      root.setProperty('--pp-run-font', cs.fontFamily)
      root.setProperty('--pp-run-color', `color-mix(in srgb, ${cs.color} 58%, white)`)
    }
    const raf = requestAnimationFrame(sync)
    window.addEventListener('beforeprint', sync)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('beforeprint', sync)
    }
  }, [theme, docTitle])
}

/* ------------------------------------------------------------------ */
/* Sidebar section                                                     */
/* ------------------------------------------------------------------ */

const selectCls = 'rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-2'
const selectStyle = { borderColor: 'var(--border)', color: 'var(--ink)' }

export function PageFurnitureSection({
  settings,
  onChange,
  supported,
}: {
  settings: PrintSettings
  onChange: (s: PrintSettings) => void
  supported: boolean
}) {
  const set = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) =>
    onChange({ ...settings, [key]: value })

  return (
    <section aria-labelledby="furniture-heading" className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
      <h2
        id="furniture-heading"
        className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
        Header &amp; footer
      </h2>
      {!supported ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          Custom page numbers, headers and footers need Chrome or Edge. In this browser, enable
          &ldquo;Headers and footers&rdquo; in the print dialog instead.
        </p>
      ) : (
        <div className="flex flex-col gap-3 text-xs" style={{ color: 'var(--ink)' }}>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={settings.pageNumbers}
              onChange={(e) => set('pageNumbers', e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Page numbers
          </label>
          {settings.pageNumbers && (
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Page number position"
                value={settings.pageNumberPosition}
                onChange={(e) => set('pageNumberPosition', e.target.value as PageNumberPosition)}
                className={selectCls}
                style={selectStyle}
              >
                <option value="bottom-center">Bottom center</option>
                <option value="bottom-right">Bottom right</option>
                <option value="top-right">Top right</option>
              </select>
              <select
                aria-label="Page number format"
                value={settings.pageNumberFormat}
                onChange={(e) => set('pageNumberFormat', e.target.value as PageNumberFormat)}
                className={selectCls}
                style={selectStyle}
              >
                <option value="n">1</option>
                <option value="n-of-total">1 / N</option>
                <option value="page-n-of-total">Page 1 of N</option>
              </select>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span>Header</span>
            <select
              value={settings.header}
              onChange={(e) => set('header', e.target.value as HeaderMode)}
              className={selectCls}
              style={selectStyle}
            >
              <option value="off">Off</option>
              <option value="title">Document title</option>
              <option value="section">Current section (H2)</option>
              <option value="custom">Custom text</option>
            </select>
          </label>
          {settings.header === 'section' && (
            <p className="leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Each page shows the section it&rsquo;s in. Needs the Pages view: printing from Preview shows the
              document title instead.
            </p>
          )}
          {settings.header === 'custom' && (
            <input
              type="text"
              aria-label="Header text"
              value={settings.headerText}
              placeholder="Header text"
              maxLength={160}
              onChange={(e) => set('headerText', e.target.value)}
              className={selectCls}
              style={selectStyle}
            />
          )}
          <label className="flex flex-col gap-1">
            <span>Footer text</span>
            <input
              type="text"
              value={settings.footerText}
              placeholder="e.g. Confidential"
              maxLength={160}
              onChange={(e) => set('footerText', e.target.value)}
              className={selectCls}
              style={selectStyle}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={settings.skipFirstPage}
              onChange={(e) => set('skipFirstPage', e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Skip on first page
          </label>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* On-screen preview on the sheet                                      */
/* ------------------------------------------------------------------ */

/**
 * Absolutely positioned inside .page-paper (screen only). Shows the
 * header/footer/page-number text in the sheet's margins and faint dashed
 * guides roughly where each printed page will end.
 */
export function PageFurnitureOverlay({
  settings,
  pageSize,
  marginScale,
  docTitle,
  showFurniture,
}: {
  settings: PrintSettings
  pageSize: PageSize
  marginScale: number
  docTitle: string | null
  showFurniture: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const paper = ref.current?.parentElement
    if (!paper) return
    const ro = new ResizeObserver(() => setHeight(paper.offsetHeight))
    ro.observe(paper)
    return () => ro.disconnect()
  }, [])

  const m = pageMargins(pageSize, marginScale)
  const flow = Math.max(0, height - 2 * m.vPx)
  const total = Math.max(1, Math.ceil(flow / m.contentPx - 0.02))
  const guides = Array.from({ length: total - 1 }, (_, i) => m.vPx + (i + 1) * m.contentPx)

  const hdr = headerText(settings, docTitle)
  const ftr = settings.footerText.trim()
  const num = (n: number) => (settings.pageNumbers ? formatPageNumber(settings.pageNumberFormat, n, total) : '')
  const pos = settings.pageNumberPosition

  // Top band = page 1 (or page 2's look, dimmed, when page 1 is skipped);
  // bottom band = the last page.
  const topPage = settings.skipFirstPage ? Math.min(2, total) : 1
  const topGhost = settings.skipFirstPage
  const bottomSkipped = settings.skipFirstPage && total === 1

  const band = (edge: 'top' | 'bottom', page: number, ghost: boolean) => {
    const left = edge === 'top' ? hdr : ftr
    const center = edge === 'bottom' && pos === 'bottom-center' ? num(page) : ''
    const right =
      (edge === 'top' && pos === 'top-right') || (edge === 'bottom' && pos === 'bottom-right') ? num(page) : ''
    if (!left && !center && !right) return null
    return (
      <div
        className="page-furniture__band"
        data-edge={edge}
        style={{
          [edge]: FURNITURE_CENTER_IN * 96,
          left: m.hPx,
          right: m.hPx,
          opacity: ghost ? 0.45 : 1,
        }}
        title={ghost ? 'Printed from page 2 on (skipped on the first page)' : 'Printed in the page margin'}
      >
        <span>{left}</span>
        <span style={{ textAlign: 'center' }}>{center}</span>
        <span style={{ textAlign: 'right' }}>{right}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="page-furniture no-print" aria-hidden="true">
      {guides.map((top, i) => (
        <div
          key={i}
          className="page-furniture__guide"
          style={{ top }}
          title="Approximate page break — the browser decides exact breaks when printing"
        >
          <span>~p.{i + 2}</span>
        </div>
      ))}
      {showFurniture && band('top', topPage, topGhost)}
      {showFurniture && !bottomSkipped && band('bottom', total, false)}
    </div>
  )
}
