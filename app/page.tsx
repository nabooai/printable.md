'use client'

import { useState } from 'react'
import { PrintDocument } from '@/components/print-document'
import { SAMPLE_MARKDOWN } from '@/lib/sample-markdown'
import { Printer, FileText, Eye, Download } from 'lucide-react'

export default function Page() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN)
  const [title, setTitle] = useState('The Art of Beautiful Print')
  const [author, setAuthor] = useState('')
  const [pageSize, setPageSize] = useState<'letter' | 'a4'>('letter')
  const [showMeta, setShowMeta] = useState(true)
  const [showEditor, setShowEditor] = useState(true)

  const handlePrint = () => window.print()

  const handleDownloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'document').replace(/\s+/g, '-').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen">
      <header
        className="no-print sticky top-0 z-30 border-b backdrop-blur-md"
        style={{
          background: 'color-mix(in oklch, var(--background) 85%, transparent)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md"
              style={{ background: 'var(--primary)' }}
            >
              <FileText className="h-5 w-5" style={{ color: 'var(--primary-foreground)' }} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-xl" style={{ color: 'var(--ink)' }}>
                Paperpress
              </div>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Markdown · printed beautifully
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditor((s) => !s)}
              className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary sm:inline-flex"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Eye className="h-4 w-4" />
              {showEditor ? 'Hide editor' : 'Show editor'}
            </button>
            <button
              onClick={handleDownloadMd}
              className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary sm:inline-flex"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Download className="h-4 w-4" />
              .md
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90"
              style={{
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
              }}
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-6 py-6 lg:grid-cols-[420px_1fr]">
        {showEditor && (
          <aside className="no-print lg:sticky lg:top-[88px] lg:h-[calc(100vh-104px)]">
            <div
              className="flex h-full flex-col rounded-lg border"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <div
                className="grid grid-cols-2 gap-3 border-b p-4"
                style={{ borderColor: 'var(--border)' }}
              >
                <label className="col-span-2 flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    Title
                  </span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Document title"
                    className="rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    Author
                  </span>
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Optional"
                    className="rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    Page size
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value as 'letter' | 'a4')}
                    className="rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <option value="letter">US Letter</option>
                    <option value="a4">A4</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={showMeta}
                    onChange={(e) => setShowMeta(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>
                    Title page header
                  </span>
                </label>
              </div>

              <div className="flex flex-1 flex-col overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-2 text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <span>Markdown</span>
                  <span>{markdown.length.toLocaleString()} chars</span>
                </div>
                <textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  spellCheck={false}
                  className="flex-1 resize-none border-t bg-transparent p-4 font-mono text-[13px] leading-relaxed outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  placeholder="# Start writing markdown..."
                />
              </div>
            </div>
          </aside>
        )}

        <section className="min-w-0">
          <div
            className="no-print mb-4 flex items-center justify-between text-xs"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <span className="uppercase tracking-wider">Preview</span>
            <span>{pageSize === 'letter' ? '8.5 × 11 in' : '210 × 297 mm'}</span>
          </div>
          <div id="print-root">
            <PrintDocument
              markdown={markdown}
              title={title}
              author={author}
              pageSize={pageSize}
              showMeta={showMeta}
            />
          </div>
          <div
            className="no-print mt-6 text-center text-xs italic"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {'Tip: in the print dialog, disable "Headers and footers" for the cleanest result.'}
          </div>
        </section>
      </div>
    </main>
  )
}
