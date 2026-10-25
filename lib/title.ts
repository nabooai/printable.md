import { fromMarkdown } from 'mdast-util-from-markdown'
import { toString } from 'mdast-util-to-string'

// Document title handling, shared by the renderer (title block), the tab
// title and the .md download filename so they always agree.
//
// The title is the document's FIRST block when that block is an H1 (ATX
// `# Title` or setext `Title\n===`), after an optional YAML frontmatter block.
// A `#` line inside a code fence, an indented code block or further down the
// document is never mistaken for it. With no leading H1, a frontmatter
// `title:` is used instead.

export interface LeadingTitle {
  /** Inline markdown of the title (`Hello *world*`), or null. */
  titleMarkdown: string | null
  /** Plain-text title (`Hello world`), or null. */
  title: string | null
  /** Markdown to render below the title block (frontmatter and H1 removed). */
  body: string
}

const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/
const ATX_H1 = /^ {0,3}#(?:[ \t]+(.*?))?[ \t]*$/
const SETEXT_H1_UNDERLINE = /^ {0,3}=+[ \t]*$/
// Lines that start some other block, so a following `===` is not a setext H1.
const OTHER_BLOCK = /^(?: {4}|\t| {0,3}(?:[>#|]|[-*+][ \t]|\d{1,9}[.)][ \t]|```|~~~|<))/

/** Split a leading YAML frontmatter block off the document. */
export function splitFrontmatter(md: string): { frontmatter: string | null; rest: string } {
  const src = md.replace(/^﻿/, '')
  const m = src.match(FRONTMATTER)
  if (!m) return { frontmatter: null, rest: src }
  return { frontmatter: m[1] ?? '', rest: src.slice(m[0].length) }
}

function frontmatterTitle(fm: string | null): string | null {
  if (!fm) return null
  const m = fm.match(/^title:[ \t]*(.+?)[ \t]*$/m)
  if (!m) return null
  let v = m[1]
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  v = v.trim()
  return v || null
}

/** Remove an ATX closing sequence (`# Title ##` → `Title`). */
function stripClosingHashes(s: string): string {
  if (/^#+$/.test(s)) return ''
  return s.replace(/[ \t]+#+[ \t]*$/, '').trim()
}

/** Plain text of a line of inline markdown (`Hello *world* [x](u)` → `Hello world x`). */
export function inlineMarkdownToText(md: string): string {
  try {
    return toString(fromMarkdown(md)).replace(/\s+/g, ' ').trim()
  } catch {
    return md.trim()
  }
}

export function extractLeadingTitle(md: string): LeadingTitle {
  const { frontmatter, rest } = splitFrontmatter(md)
  const fmTitle = frontmatterTitle(frontmatter)
  const lines = rest.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  const first = (lines[i] ?? '').replace(/\r$/, '')

  let titleMd: string | null = null
  let consumed = -1
  const atx = first.match(ATX_H1)
  if (atx) {
    titleMd = stripClosingHashes(atx[1] ?? '')
    consumed = i + 1
  } else if (
    first.trim() &&
    !OTHER_BLOCK.test(first) &&
    SETEXT_H1_UNDERLINE.test((lines[i + 1] ?? '').replace(/\r$/, ''))
  ) {
    titleMd = first.trim()
    consumed = i + 2
  }

  if (consumed >= 0) {
    const body = lines.slice(consumed).join('\n').replace(/^\s*\n/, '')
    if (titleMd) {
      return { titleMarkdown: titleMd, title: inlineMarkdownToText(titleMd) || null, body }
    }
    // An empty `#` heading: drop it, fall back to frontmatter.
    return { titleMarkdown: null, title: fmTitle, body }
  }
  return { titleMarkdown: null, title: fmTitle, body: rest }
}

/**
 * Plain-text title for the tab title and download filename: the leading title
 * (H1 or frontmatter `title:`), else the first ATX H1 anywhere outside code.
 */
export function documentTitle(md: string): string | null {
  const lead = extractLeadingTitle(md)
  if (lead.title) return lead.title
  let fence: string | null = null
  for (const raw of lead.body.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const m = line.match(ATX_H1)
    if (m && m[1]) {
      const t = inlineMarkdownToText(stripClosingHashes(m[1]))
      if (t) return t
    }
  }
  return null
}
