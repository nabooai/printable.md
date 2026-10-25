'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export type Theme =
  | 'editorial'
  | 'scientific'
  | 'manuscript'
  | 'minimal'
  | 'magazine'
  | 'newspaper'
  | 'hipster'
  | 'technical'
  | 'scholarly'
  | 'modernist'
  | 'brutalist'
  | 'zine'
export type PageSize = 'letter' | 'a4'

export interface TypographySettings {
  fontScale: number      // 0.75 — 1.4
  lineHeight: number     // 1.2 — 2.2
  paragraphSpacing: number // 0.5 — 2.0
  letterSpacing: number  // -0.04 — 0.08 em
  pageMargin: number     // 0.6 — 1.4 (multiplier on theme default)
  justify: boolean
  hyphenate: boolean
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontScale: 1,
  lineHeight: 1.6,
  paragraphSpacing: 1,
  letterSpacing: 0,
  pageMargin: 1,
  justify: true,
  hyphenate: true,
}

interface PrintDocumentProps {
  markdown: string
  pageSize: PageSize
  theme: Theme
  typography?: TypographySettings
  onMarkdownChange?: (md: string) => void
  /** Screen-only decoration rendered inside the sheet (page furniture preview). */
  overlay?: React.ReactNode
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

export function PrintDocument({
  markdown,
  pageSize,
  theme,
  typography = DEFAULT_TYPOGRAPHY,
  onMarkdownChange,
  overlay,
}: PrintDocumentProps) {
  const { title, body } = useMemo(() => extractLeadingTitle(markdown), [markdown])
  // Avoid SSR/CSR mismatch: rehype-highlight produces different markup on the
  // client than the server snapshot (token vs hljs- classes). Defer markdown
  // rendering until after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const editorRef = useRef<HTMLDivElement>(null)
  const isEmpty = markdown.trim().length === 0

  // Auto-focus the editable area on mount so the caret is blinking and ready.
  useEffect(() => {
    if (isEmpty && editorRef.current && mounted) {
      editorRef.current.focus()
    }
  }, [isEmpty, mounted])

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!onMarkdownChange) return
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim()) return
    e.preventDefault()
    onMarkdownChange(text)
  }

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (!onMarkdownChange) return
    // Capture plain text from the contenteditable while user is typing.
    // We only do this while the document is still empty; once content
    // exists, the rendered markdown view takes over.
    const text = (e.currentTarget.innerText ?? '').trim()
    if (text.length > 0) {
      onMarkdownChange(e.currentTarget.innerText)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Insert real newlines on Enter (default contenteditable behavior emits <div> / <br> mess).
    if (e.key === 'Enter') {
      e.preventDefault()
      document.execCommand('insertText', false, '\n')
    }
  }

  const cssVars = {
    '--pp-fs-scale': typography.fontScale,
    '--pp-line-height': typography.lineHeight,
    '--pp-para-spacing': typography.paragraphSpacing,
    '--pp-letter-spacing': `${typography.letterSpacing}em`,
    '--pp-page-margin': typography.pageMargin,
    '--pp-text-align': typography.justify ? 'justify' : 'left',
    '--pp-hyphens': typography.hyphenate ? 'auto' : 'manual',
  } as React.CSSProperties

  return (
    <div className="print-stage" style={cssVars}>
      <article
        className={`page-paper page-paper--${theme}`}
        data-size={pageSize}
        data-theme={theme}
      >
        <div className="page-paper__inner">
          {isEmpty ? (
            <div
              ref={editorRef}
              className={`paste-editor prose-print prose-print--${theme}`}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              data-placeholder="Start typing or paste markdown (Cmd/Ctrl+V)…"
              onPaste={handlePaste}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              aria-label="Markdown editor"
            />
          ) : (
            <>
              {title ? (
                <header className={`doc-header doc-header--${theme}`}>
                  <h1 className="doc-title">{title}</h1>
                </header>
              ) : null}
              <div className={`prose-print prose-print--${theme}`} suppressHydrationWarning>
                {mounted ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {body}
                  </ReactMarkdown>
                ) : null}
              </div>
            </>
          )}
        </div>
        {overlay}
      </article>
    </div>
  )
}
