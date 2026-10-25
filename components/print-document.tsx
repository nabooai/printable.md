'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useIsClient } from '@/hooks/use-media-query'

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
}: PrintDocumentProps) {
  const { title, body } = useMemo(() => extractLeadingTitle(markdown), [markdown])
  // Avoid SSR/CSR mismatch: rehype-highlight produces different markup on the
  // client than the server snapshot (token vs hljs- classes). Defer markdown
  // rendering until running on the client.
  const mounted = useIsClient()
  const isEmpty = markdown.trim().length === 0

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
            <p className={`empty-hint no-print prose-print prose-print--${theme}`}>
              Nothing here yet. Paste markdown, open a file, or switch to Source to type.
            </p>
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
      </article>
    </div>
  )
}
