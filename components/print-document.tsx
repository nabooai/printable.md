'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export type Theme = 'editorial' | 'scientific' | 'manuscript' | 'minimal'
export type PageSize = 'letter' | 'a4'

interface PrintDocumentProps {
  markdown: string
  pageSize: PageSize
  theme: Theme
}

// Extract the first leading H1 ("# Title") from the markdown so we can render it
// as a styled title block instead of a normal heading. Returns null if the
// document does not start with an H1.
function extractLeadingTitle(md: string): { title: string | null; body: string } {
  const trimmed = md.replace(/^\uFEFF/, '').replace(/^\s+/, '')
  const match = trimmed.match(/^#\s+(.+?)\s*$/m)
  if (!match || trimmed.indexOf(match[0]) !== 0) {
    return { title: null, body: md }
  }
  const title = match[1].trim()
  const body = trimmed.slice(match[0].length).replace(/^\s*\n/, '')
  return { title, body }
}

export function PrintDocument({ markdown, pageSize, theme }: PrintDocumentProps) {
  const { title, body } = useMemo(() => extractLeadingTitle(markdown), [markdown])

  return (
    <div className="print-stage">
      <article
        className={`page-paper page-paper--${theme}`}
        data-size={pageSize}
        data-theme={theme}
      >
        <div className="page-paper__inner">
          {title ? (
            <header className={`doc-header doc-header--${theme}`}>
              <h1 className="doc-title">{title}</h1>
            </header>
          ) : null}
          <div className={`prose-print prose-print--${theme}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {body}
            </ReactMarkdown>
          </div>
        </div>
      </article>
    </div>
  )
}
