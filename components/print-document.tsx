'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface PrintDocumentProps {
  markdown: string
  title?: string
  author?: string
  pageSize: 'letter' | 'a4'
  showMeta: boolean
}

export function PrintDocument({
  markdown,
  title,
  author,
  pageSize,
  showMeta,
}: PrintDocumentProps) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <article className="page-sheet" data-size={pageSize} id="print-area">
      {showMeta && (title || author) && (
        <header className="mb-10 text-center">
          {title && (
            <div
              className="font-display text-5xl text-balance"
              style={{ color: 'var(--ink)' }}
            >
              {title}
            </div>
          )}
          <div
            className="mt-3 flex items-center justify-center gap-3 text-sm italic"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {author && <span>{author}</span>}
            {author && <span aria-hidden>·</span>}
            <span>{today}</span>
          </div>
          <div
            className="mx-auto mt-6 h-px w-24"
            style={{ background: 'var(--rule)' }}
          />
        </header>
      )}

      <div className="prose-print">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  )
}
