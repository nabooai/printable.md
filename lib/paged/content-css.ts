// Builds the stylesheet the Pages view hands to Paged.js: the app's own CSS
// as the PRINT media sees it, scoped to the paginated copy.
//
// Why not just pass the app's stylesheets? Paged.js re-inserts whatever it is
// given into <head> globally, unwrapping `@media print` blocks and dropping
// `@media screen` ones. Done to the app's CSS that would apply print rules
// (`.no-print { display: none }`, white page, …) to the whole app on screen.
// Instead we read the already-loaded stylesheets through the CSSOM (no
// fetch(), so CSP connect-src stays 'self' and nothing is re-downloaded) and:
//  - keep top-level style rules, flatten `@media print` rules in place (so the
//    print cascade order is exactly what Chrome uses when printing), drop
//    screen-only / other media, @page, @font-face, @keyframes;
//  - skip @layer blocks (Tailwind theme/base/utilities): they are not
//    media-dependent and already apply to the copy through the global sheet;
//  - prefix every selector with `.pp-scope ` (the wrapper around the copy).
//    The prefix adds the same specificity to every rule, so relative order
//    and specificity among them are unchanged, and the copy beats the global
//    screen rules it duplicates;
//  - keep only rules whose selector matches something in this document, so
//    Paged.js (which re-parses everything with css-tree) has little to chew.
//
// Paged.js needs these declarations in the CSS it parses — not just in effect
// on the page — because it turns break-before/-after, string-set and display
// rules into attributes on the content by running the selectors against it.

export const SCOPE_CLASS = 'pp-scope'
const SCOPE = `.${SCOPE_CLASS}`

interface ScopedRule {
  /** Selector used to test whether the rule can match anything (pseudo-elements stripped). */
  test: string
  css: string
}

let cache: { key: string; rules: ScopedRule[] } | null = null

/** Split a selector list on top-level commas (not inside (), [] or strings). */
export function splitSelectorList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(list.slice(start).trim())
  return out.filter(Boolean)
}

/** Scope one selector to the paginated copy; null when it can't match there. */
export function scopeSelector(sel: string): string | null {
  // Document-level selectors: the scope wrapper stands in for html/body/:root.
  const m = /^(?:html|body|:root)(?=$|[\s>+~.#:[])/.exec(sel)
  if (m) {
    const rest = sel.slice(m[0].length)
    // `html.foo …` / `:root[data-x] …` describe app state we don't mirror.
    if (/^[.#:[]/.test(rest)) return null
    return rest.trim() ? `${SCOPE} ${rest.trim().replace(/^[>+~]\s*/, '')}` : SCOPE
  }
  return `${SCOPE} ${sel}`
}

// Pseudo-elements can't go through querySelector; strip them for the test.
const PSEUDO_ELEMENT = /::?(?:before|after|marker|first-letter|first-line|selection|placeholder|backdrop|file-selector-button|details-content|-webkit-[\w-]+|-moz-[\w-]+)(?:\([^)]*\))?/g

function testSelector(scoped: string): string {
  return scoped.replace(PSEUDO_ELEMENT, '').trim() || SCOPE
}

type MediaVerdict = 'print' | 'skip'

function mediaVerdict(media: MediaList): MediaVerdict {
  const text = media.mediaText.toLowerCase()
  // Only blocks meant for print are flattened; everything else is screen
  // behaviour (or a viewport/preference query that means nothing on paper).
  if (/\bprint\b/.test(text) && !/\bnot\s+print\b/.test(text)) return 'print'
  return 'skip'
}

function collect(rules: CSSRuleList, out: ScopedRule[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const body = rule.style.cssText
      if (!body) continue
      for (const sel of splitSelectorList(rule.selectorText)) {
        const scoped = scopeSelector(sel)
        if (scoped) out.push({ test: testSelector(scoped), css: `${scoped} { ${body} }` })
      }
    } else if (rule instanceof CSSMediaRule) {
      if (mediaVerdict(rule.media) === 'print') collect(rule.cssRules, out)
    } else if (rule instanceof CSSSupportsRule) {
      if (CSS.supports(rule.conditionText)) collect(rule.cssRules, out)
    }
    // CSSLayerBlockRule, CSSPageRule, CSSFontFaceRule, CSSKeyframesRule, … skipped.
  }
}

function appSheets(): CSSStyleSheet[] {
  return Array.from(document.styleSheets).filter((s) => {
    const owner = s.ownerNode
    if (!(owner instanceof HTMLElement)) return false
    // Only the bundled app CSS (<link rel=stylesheet>, incl. next/font) and
    // React-hoisted styles. Plain <style> elements are ours or Paged.js's
    // (#pp-page-size-style, Paged.js base/work sheets) and must not loop back.
    return owner instanceof HTMLLinkElement || owner.hasAttribute('data-precedence')
  })
}

function scopedRules(): ScopedRule[] {
  const sheets = appSheets()
  const key = sheets.map((s) => `${s.href ?? 'inline'}:${safeLength(s)}`).join('|')
  if (cache?.key === key) return cache.rules
  const rules: ScopedRule[] = []
  for (const s of sheets) {
    try {
      collect(s.cssRules, rules)
    } catch {
      // Cross-origin sheet without CORS: unreadable, skip it.
    }
  }
  cache = { key, rules }
  return rules
}

function safeLength(s: CSSStyleSheet): number {
  try {
    return s.cssRules.length
  } catch {
    return -1
  }
}

/**
 * The scoped print-cascade CSS for `content` (a detached copy whose root is
 * the `.pp-scope` wrapper). Rules that match nothing in it are left out.
 */
export function buildContentCss(content: ParentNode): string {
  const out: string[] = []
  const seen = new Map<string, boolean>()
  for (const r of scopedRules()) {
    let hit = seen.get(r.test)
    if (hit === undefined) {
      try {
        hit = content.querySelector(r.test) !== null
      } catch {
        // Selector the engine can't run against a fragment (e.g. :hover
        // edge cases): keep it, it's harmless.
        hit = true
      }
      seen.set(r.test, hit)
    }
    if (hit) out.push(r.css)
  }
  return out.join('\n')
}
