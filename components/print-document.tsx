'use client'

import { useMemo, useState } from 'react'
import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import { visit } from 'unist-util-visit'
import type { Element, ElementContent, Root } from 'hast'
import { useIsClient } from '@/hooks/use-media-query'
import { extractLeadingTitle } from '@/lib/title'

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

/** Paragraph alignment override. Absent = the theme's own alignment. */
export type TextAlign = 'justify' | 'left'

export interface TypographySettings {
  fontScale: number      // 0.75 — 1.4
  lineHeight: number     // 1.2 — 2.2
  paragraphSpacing: number // 0.5 — 2.0
  letterSpacing: number  // -0.04 — 0.08 em
  pageMargin: number     // 0.6 — 1.4 (multiplier on theme default)
  align?: TextAlign
  hyphenate: boolean
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontScale: 1,
  lineHeight: 1.6,
  paragraphSpacing: 1,
  letterSpacing: 0,
  pageMargin: 1,
  hyphenate: true,
}

interface PrintDocumentProps {
  markdown: string
  pageSize: PageSize
  theme: Theme
  typography?: TypographySettings
  /** Screen-only decoration rendered inside the sheet (page furniture preview). */
  overlay?: React.ReactNode
}

// ---- Markdown pipeline (module constants so React can skip re-rendering) ----

// Raw HTML is parsed (rehype-raw) and then sanitized against GitHub's schema,
// extended with a few presentational tags. No scripts, event handlers,
// iframes or style attributes survive. <picture>/<source> are removed because
// srcset would auto-load remote images behind the remote-image gate below.
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []).filter((t) => t !== 'picture' && t !== 'source'),
    'mark',
    'u',
    'small',
    'abbr',
    'cite',
    'dfn',
    'figure',
    'figcaption',
    'caption',
  ],
  attributes: {
    ...defaultSchema.attributes,
    abbr: ['title'],
    // Footnote section label: remark-rehype marks it sr-only; we style it visibly.
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align'],
  },
}

// Sanitize prefixes every id with "user-content-" (so pasted HTML can't clobber
// app DOM ids like #print-root). remark-rehype is told not to prefix, and
// in-document "#anchor" links are rewritten to match, so footnote links work.
const ID_PREFIX = 'user-content-'
function rehypePrefixHashLinks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      const href = node.tagName === 'a' ? node.properties?.href : undefined
      if (typeof href === 'string' && href.startsWith('#') && href.length > 1 && !href.startsWith(`#${ID_PREFIX}`)) {
        node.properties.href = `#${ID_PREFIX}${href.slice(1)}`
      }
    })
  }
}

const REMARK_PLUGINS: Options['remarkPlugins'] = [remarkGfm, remarkFrontmatter]
// Order matters: raw HTML → sanitize → (fix links) → highlight.
const REHYPE_PLUGINS: Options['rehypePlugins'] = [
  rehypeRaw,
  [rehypeSanitize, SANITIZE_SCHEMA],
  rehypePrefixHashLinks,
  rehypeHighlight,
]
const REMARK_REHYPE_OPTIONS: Options['remarkRehypeOptions'] = {
  clobberPrefix: '',
  footnoteLabel: 'Notes',
}

function isRemoteUrl(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src) && !/^(?:data|blob):/i.test(src)
}

function hostOf(src: string): string {
  try {
    return new URL(src, 'https://x.invalid/').host
  } catch {
    return ''
  }
}

// Remote images are not fetched until the reader asks: a pasted confidential
// doc must not ping tracking pixels or leak the reader's IP to image hosts.
function MarkdownImage({ src, alt, node, ...rest }: React.ComponentProps<'img'> & { node?: unknown }) {
  void node
  const [load, setLoad] = useState(false)
  if (typeof src === 'string' && isRemoteUrl(src) && !load) {
    const host = hostOf(src)
    return (
      <button
        type="button"
        className="remote-image-chip"
        title={`Load ${src}`}
        onClick={() => setLoad(true)}
      >
        <span className="remote-image-chip__label">Remote image:</span> {alt || 'untitled'}
        {host ? ` (${host})` : ''}
        <span className="remote-image-chip__action"> — click to load</span>
      </button>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element -- arbitrary user markdown images
  return <img src={src} alt={alt ?? ''} {...rest} />
}

function isWhitespaceText(n: ElementContent): boolean {
  return n.type === 'text' && n.value.trim() === ''
}
function isImageish(n: ElementContent): boolean {
  if (n.type !== 'element') return false
  if (n.tagName === 'img') return true
  if (n.tagName === 'a') {
    const kids = n.children.filter((c) => !isWhitespaceText(c))
    return kids.length === 1 && isImageish(kids[0])
  }
  return false
}

const COMPONENTS: Components = {
  img: MarkdownImage,
  // Bare URLs as link text get .pp-url so they can break anywhere.
  a({ node, ...props }) {
    const kids = node?.children ?? []
    const text = kids.length === 1 && kids[0].type === 'text' ? kids[0].value : ''
    const url = /^(?:https?:\/\/|www\.)\S+$/i.test(text)
    return <a {...props} className={url ? 'pp-url' : props.className} />
  },
  // Only an image that stands alone in its paragraph becomes a centred block;
  // inline images (badges, icons) stay in the line of text.
  p({ node, ...props }) {
    const kids = node?.children.filter((c) => !isWhitespaceText(c)) ?? []
    const solo = kids.length === 1 && isImageish(kids[0])
    return <p {...props} className={solo ? 'pp-image-para' : undefined} />
  },
}

// The title is rendered as inline markdown only (no block elements).
const TITLE_ALLOWED = [
  'em', 'strong', 'a', 'code', 'del', 's', 'sub', 'sup', 'kbd', 'mark', 'u', 'b', 'i', 'br', 'span', 'small',
]
const TITLE_COMPONENTS: Components = {
  p: ({ children }) => <>{children}</>,
  img: MarkdownImage,
}

export function PrintDocument({
  markdown,
  pageSize,
  theme,
  typography = DEFAULT_TYPOGRAPHY,
  overlay,
}: PrintDocumentProps) {
  const { titleMarkdown, title, body } = useMemo(() => extractLeadingTitle(markdown), [markdown])
  // Avoid SSR/CSR mismatch: rehype-highlight produces different markup on the
  // client than the server snapshot (token vs hljs- classes). Defer markdown
  // rendering until running on the client.
  const mounted = useIsClient()
  const isEmpty = markdown.trim().length === 0

  // Memoised on the markdown alone: theme / typography changes only touch CSS
  // classes and variables, so React skips re-rendering (and re-highlighting)
  // the whole document.
  const renderedBody = useMemo(
    () =>
      mounted ? (
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          remarkRehypeOptions={REMARK_REHYPE_OPTIONS}
          components={COMPONENTS}
        >
          {body}
        </ReactMarkdown>
      ) : null,
    [body, mounted],
  )
  const renderedTitle = useMemo(
    () =>
      titleMarkdown && mounted ? (
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={TITLE_COMPONENTS}
          allowedElements={TITLE_ALLOWED}
          unwrapDisallowed
        >
          {titleMarkdown}
        </ReactMarkdown>
      ) : (
        title
      ),
    [titleMarkdown, title, mounted],
  )

  const cssVars = {
    '--pp-fs-scale': typography.fontScale,
    '--pp-line-height': typography.lineHeight,
    '--pp-para-spacing': typography.paragraphSpacing,
    '--pp-letter-spacing': `${typography.letterSpacing}em`,
    '--pp-page-margin': typography.pageMargin,
    ...(typography.align ? { '--pp-text-align': typography.align === 'left' ? 'start' : 'justify' } : null),
    '--pp-hyphens': typography.hyphenate ? 'auto' : 'manual',
  } as React.CSSProperties

  return (
    <div className="print-stage" style={cssVars} data-align={typography.align}>
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
                  <h1 className="doc-title">{renderedTitle}</h1>
                </header>
              ) : null}
              <div
                className={`prose-print prose-print--${theme}`}
                data-has-title={title ? '' : undefined}
                suppressHydrationWarning
              >
                {renderedBody}
              </div>
            </>
          )}
        </div>
        {overlay}
      </article>
    </div>
  )
}
