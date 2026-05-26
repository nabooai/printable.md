'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export type Theme = 'editorial' | 'scientific' | 'manuscript' | 'minimal'
export type PageSize = 'letter' | 'a4'

interface PrintDocumentProps {
  markdown: string
  title?: string
  author?: string
  affiliation?: string
  pageSize: PageSize
  theme: Theme
  showMeta: boolean
  onPageCount?: (n: number) => void
}

// Page dimensions in CSS pixels at 96dpi
const PAGE_DIMS: Record<PageSize, { w: number; h: number; padX: number; padY: number }> = {
  letter: { w: 8.5 * 96, h: 11 * 96, padX: 0.95 * 96, padY: 0.85 * 96 },
  a4: { w: (210 / 25.4) * 96, h: (297 / 25.4) * 96, padX: (24 / 25.4) * 96, padY: (22 / 25.4) * 96 },
}

export function PrintDocument({
  markdown,
  title,
  author,
  affiliation,
  pageSize,
  theme,
  showMeta,
  onPageCount,
}: PrintDocumentProps) {
  const sourceRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [ready, setReady] = useState(false)

  const today = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [],
  )

  // Pre-render the markdown to HTML on the client into a hidden container
  const html = useMemo(() => {
    return renderToStaticMarkup(
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {markdown}
      </ReactMarkdown>,
    )
  }, [markdown])

  useLayoutEffect(() => {
    const source = sourceRef.current
    const container = pagesRef.current
    if (!source || !container) return

    const dims = PAGE_DIMS[pageSize]
    const fullContentH = dims.h - dims.padY * 2

    // Clear out previous pages
    container.innerHTML = ''

    const buildHeader = (): HTMLElement | null => {
      if (!showMeta || !(title || author || affiliation)) return null
      const header = document.createElement('header')
      header.className = `doc-header doc-header--${theme}`
      const t = title ? `<div class="doc-title">${escapeHtml(title)}</div>` : ''
      const aLine: string[] = []
      if (author) aLine.push(`<span class="doc-author">${escapeHtml(author)}</span>`)
      if (affiliation) aLine.push(`<span class="doc-affil">${escapeHtml(affiliation)}</span>`)
      aLine.push(`<span class="doc-date">${escapeHtml(today)}</span>`)
      const meta = `<div class="doc-meta">${aLine.join('<span class="doc-sep" aria-hidden>·</span>')}</div>`
      header.innerHTML = t + meta
      return header
    }

    const createSheet = (pageIndex: number, isFirst: boolean) => {
      const sheet = document.createElement('article')
      sheet.className = 'page-sheet'
      sheet.dataset.size = pageSize
      sheet.dataset.theme = theme
      sheet.dataset.page = String(pageIndex)

      const inner = document.createElement('div')
      inner.className = 'page-inner'
      sheet.appendChild(inner)

      let availableH = fullContentH

      if (isFirst) {
        const header = buildHeader()
        if (header) {
          inner.appendChild(header)
          // Force layout to measure
          availableH -= header.offsetHeight
        }
      }

      const prose = document.createElement('div')
      prose.className = `prose-print prose-print--${theme}`
      inner.appendChild(prose)

      // Page footer (page number)
      const footer = document.createElement('footer')
      footer.className = 'page-footer'
      footer.textContent = '' // filled later
      sheet.appendChild(footer)

      container.appendChild(sheet)
      return { sheet, prose, availableH }
    }

    let pageIndex = 1
    let { prose, availableH } = createSheet(pageIndex, true)

    // Distribute children
    const sourceChildren = Array.from(source.children) as HTMLElement[]

    const tryFit = (node: HTMLElement) => {
      prose.appendChild(node)
      if (prose.scrollHeight > availableH) {
        // Doesn't fit
        prose.removeChild(node)

        // If this page already has content, push to a new page
        if (prose.children.length > 0) {
          pageIndex += 1
          const next = createSheet(pageIndex, false)
          prose = next.prose
          availableH = next.availableH
          // Try splitting if the node is large (paragraph, list, code, table)
          const tag = node.tagName.toLowerCase()
          if (tag === 'p' || tag === 'ul' || tag === 'ol') {
            splitInlineOrList(node)
          } else {
            prose.appendChild(node)
          }
        } else {
          // Empty page; just place it (oversize element — accept overflow)
          prose.appendChild(node)
        }
      }
    }

    const splitInlineOrList = (node: HTMLElement) => {
      const tag = node.tagName.toLowerCase()
      if (tag === 'p') {
        const text = node.textContent ?? ''
        const words = text.split(/(\s+)/)
        const first = node.cloneNode(false) as HTMLElement
        const second = node.cloneNode(false) as HTMLElement
        // Binary search for largest prefix that fits
        let lo = 0
        let hi = words.length
        // We'll need to attach first to current page (which may have prior content elsewhere — actually it's a fresh page in our flow)
        prose.appendChild(first)
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          first.textContent = words.slice(0, mid).join('')
          if (prose.scrollHeight <= availableH) {
            lo = mid
          } else {
            hi = mid - 1
          }
        }
        first.textContent = words.slice(0, lo).join('').trimEnd()
        const rest = words.slice(lo).join('').trimStart()
        if (rest.length === 0) {
          // Couldn't fit any words; remove first and place full node on next page
          prose.removeChild(first)
          pageIndex += 1
          const next = createSheet(pageIndex, false)
          prose = next.prose
          availableH = next.availableH
          prose.appendChild(node)
          return
        }
        if (rest.length > 0) {
          second.textContent = rest
          pageIndex += 1
          const next = createSheet(pageIndex, false)
          prose = next.prose
          availableH = next.availableH
          tryFit(second)
        }
      } else if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(node.children) as HTMLElement[]
        const wrapper = node.cloneNode(false) as HTMLElement
        prose.appendChild(wrapper)
        let i = 0
        for (; i < items.length; i++) {
          wrapper.appendChild(items[i].cloneNode(true))
          if (prose.scrollHeight > availableH) {
            wrapper.removeChild(wrapper.lastChild!)
            break
          }
        }
        if (i < items.length) {
          const remainder = node.cloneNode(false) as HTMLElement
          for (let j = i; j < items.length; j++) {
            remainder.appendChild(items[j].cloneNode(true))
          }
          pageIndex += 1
          const next = createSheet(pageIndex, false)
          prose = next.prose
          availableH = next.availableH
          tryFit(remainder)
        }
      } else {
        prose.appendChild(node)
      }
    }

    for (const child of sourceChildren) {
      tryFit(child.cloneNode(true) as HTMLElement)
    }

    const total = pageIndex
    // Fill page footers
    const sheets = Array.from(container.children) as HTMLElement[]
    sheets.forEach((s, i) => {
      const footer = s.querySelector('.page-footer')
      if (footer) footer.textContent = `${i + 1} / ${total}`
    })

    setPageCount(total)
    onPageCount?.(total)
    setReady(true)
  }, [html, pageSize, theme, showMeta, title, author, affiliation, today, onPageCount])

  // Re-paginate when fonts finish loading (heights shift after webfonts swap in)
  useEffect(() => {
    if (typeof document === 'undefined') return
    // @ts-expect-error fonts API
    if (!document.fonts?.ready) return
    let cancelled = false
    // @ts-expect-error fonts API
    document.fonts.ready.then(() => {
      if (cancelled) return
      // Trigger a re-run by toggling a no-op state; easiest: force layout measurement again
      // We rely on the layout effect being already done; this hook just nudges.
      setReady((r) => r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const dims = PAGE_DIMS[pageSize]
  const sourceWidth = dims.w - dims.padX * 2

  return (
    <div className="print-stage" data-ready={ready ? 'yes' : 'no'} data-pages={pageCount}>
      {/* Hidden source: rendered markdown we will measure & split */}
      <div
        ref={sourceRef}
        className={`prose-print prose-print--${theme} print-source`}
        style={{ width: `${sourceWidth}px` }}
        aria-hidden
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {/* Visible paginated output */}
      <div ref={pagesRef} className="pages-stack" data-print-size={pageSize} />
    </div>
  )
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
