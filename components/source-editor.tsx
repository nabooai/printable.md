'use client'

import type { Ref } from 'react'

const PLACEHOLDER = `Paste or type markdown here.

Paste a whole document (Cmd/Ctrl+V) and it's typeset right away,
open a .md file (Cmd/Ctrl+O), or drop one anywhere on the page.

# Your title
Some **bold** text, a [link](https://printable.md), a list:
- one
- two`

export function SourceEditor({
  value,
  onChange,
  onPasteIntoEmpty,
  ref,
}: {
  value: string
  onChange: (md: string) => void
  /** Called instead of a normal paste when the document is empty. */
  onPasteIntoEmpty: (text: string) => void
  ref?: Ref<HTMLTextAreaElement>
}) {
  return (
    <textarea
      ref={ref}
      className="source-editor w-full resize-none rounded-lg border p-5 font-mono text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring/25"
      style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--ink)' }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        if (value.trim()) return
        const text = e.clipboardData.getData('text/plain')
        if (!text.trim()) return
        e.preventDefault()
        onPasteIntoEmpty(text)
      }}
      placeholder={PLACEHOLDER}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      aria-label="Markdown source"
    />
  )
}
