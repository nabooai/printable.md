'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PrintDocument,
  type Theme,
  type PageSize,
  type TypographySettings,
  DEFAULT_TYPOGRAPHY,
} from '@/components/print-document'
import { SAMPLE_MARKDOWN } from '@/lib/sample-markdown'
import { useLocalStorage } from '@/hooks/use-local-storage'
import {
  Printer,
  FileText,
  Download,
  BookOpen,
  FlaskConical,
  Type,
  Minus,
  Newspaper,
  Sparkles,
  Coffee,
  Code2,
  GraduationCap,
  Square,
  Hash,
  Scissors,
  RotateCcw,
  Sliders,
  ClipboardPaste,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'

const THEMES: {
  id: Theme
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'scientific', label: 'Scientific', description: 'IEEE-style research paper', icon: FlaskConical },
  { id: 'editorial', label: 'Editorial', description: 'Magazine essay with drop cap', icon: BookOpen },
  { id: 'magazine', label: 'Magazine', description: 'Glossy display serif', icon: Sparkles },
  { id: 'newspaper', label: 'Newspaper', description: 'Condensed broadsheet', icon: Newspaper },
  { id: 'hipster', label: 'Hipster', description: 'Mixed type, kraft paper', icon: Coffee },
  { id: 'technical', label: 'Technical', description: 'Spec / API documentation', icon: Code2 },
  { id: 'scholarly', label: 'Scholarly', description: 'Classical book, small caps', icon: GraduationCap },
  { id: 'modernist', label: 'Modernist', description: 'Swiss grid, sans-serif', icon: Square },
  { id: 'brutalist', label: 'Brutalist', description: 'Hard black, raw', icon: Hash },
  { id: 'zine', label: 'Zine', description: 'Photocopy punk', icon: Scissors },
  { id: 'manuscript', label: 'Manuscript', description: 'Typewritten, double-spaced', icon: Type },
  { id: 'minimal', label: 'Minimal', description: 'Clean sans-serif', icon: Minus },
]

export default function Page() {
  // Markdown is intentionally NOT persisted — every reload starts with a clean,
  // blinking-caret page so it's obvious you can paste/type fresh content.
  const [markdown, setMarkdown] = useState<string>('')
  const [pageSize, setPageSize] = useLocalStorage<PageSize>('pp:pageSize', 'letter')
  const [theme, setTheme] = useLocalStorage<Theme>('pp:theme', 'scientific')
  const [typography, setTypography] = useLocalStorage<TypographySettings>('pp:typo', DEFAULT_TYPOGRAPHY)
  const [showSidebar, setShowSidebar] = useState(true)
  const [pasteFlash, setPasteFlash] = useState(false)
  const pasteFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Briefly highlight the page after new content arrives. Restarts the timer
  // on repeated calls and clears it on unmount.
  const flashPaste = useCallback(() => {
    if (pasteFlashTimer.current) clearTimeout(pasteFlashTimer.current)
    setPasteFlash(true)
    pasteFlashTimer.current = setTimeout(() => setPasteFlash(false), 600)
  }, [])
  useEffect(() => () => {
    if (pasteFlashTimer.current) clearTimeout(pasteFlashTimer.current)
  }, [])

  const updateTypo = <K extends keyof TypographySettings>(key: K, value: TypographySettings[K]) => {
    setTypography({ ...typography, [key]: value })
  }
  const resetTypo = () => setTypography(DEFAULT_TYPOGRAPHY)

  // Global paste — anywhere in the window. We avoid stealing paste from real
  // text inputs/textareas/contenteditable so the typography sliders' number
  // inputs etc. still work normally.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (target as HTMLElement).isContentEditable
        ) {
          return
        }
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text.trim()) return
      e.preventDefault()
      setMarkdown(text)
      flashPaste()
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [setMarkdown, flashPaste])

  // Update document.title from first heading
  useEffect(() => {
    const firstHeading = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
    document.title = firstHeading ? `${firstHeading} | Nisism Print` : 'Nisism Print'
  }, [markdown])

  // Set @page size at print time based on selection
  useEffect(() => {
    const styleId = 'pp-page-size-style'
    let el = document.getElementById(styleId) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = styleId
      document.head.appendChild(el)
    }
    el.textContent = `@media print { @page { size: ${pageSize === 'a4' ? 'A4' : 'letter'}; margin: ${
      pageSize === 'a4' ? '22mm 24mm' : '0.85in 0.95in'
    }; } }`
  }, [pageSize])

  const handlePrint = () => window.print()

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) {
        setMarkdown(text)
        flashPaste()
      }
    } catch {
      alert('Could not read clipboard. Press Ctrl/Cmd+V anywhere on the page instead.')
    }
  }

  const handleClear = () => {
    if (markdown.trim() && !confirm('Clear the document?')) return
    setMarkdown('')
  }

  const handleLoadSample = () => setMarkdown(SAMPLE_MARKDOWN)

  const handleDownloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const firstHeading = markdown.match(/^#\s+(.+?)\s*$/m)?.[1] ?? 'document'
    a.href = url
    a.download = `${firstHeading.replace(/\s+/g, '-').toLowerCase().slice(0, 60)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isEmpty = markdown.trim().length === 0

  return (
    <main className="min-h-screen">
      <header
        className="no-print sticky top-0 z-30 border-b backdrop-blur-md"
        style={{
          background: 'color-mix(in oklch, var(--background) 88%, transparent)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-secondary"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              aria-label="Toggle sidebar"
            >
              {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md"
              style={{ background: 'var(--primary)' }}
            >
              <FileText className="h-5 w-5" style={{ color: 'var(--primary-foreground)' }} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-xl" style={{ color: 'var(--ink)' }}>
                Nisism Print
              </div>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Paste markdown. Print beautifully.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePasteFromClipboard}
              className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary sm:inline-flex"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste
            </button>
            {!isEmpty && (
              <button
                onClick={handleClear}
                className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary sm:inline-flex"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            )}
            <button
              onClick={handleDownloadMd}
              disabled={isEmpty}
              className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary disabled:opacity-40 sm:inline-flex"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Download className="h-4 w-4" />
              .md
            </button>
            <button
              onClick={handlePrint}
              disabled={isEmpty}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>
      </header>

      <div
        className={`mx-auto grid max-w-[1500px] gap-6 px-6 py-6 ${
          showSidebar ? 'lg:grid-cols-[360px_1fr]' : ''
        }`}
      >
        {showSidebar && (
          <aside className="no-print lg:sticky lg:top-[88px] lg:h-[calc(100vh-104px)]">
            <div
              className="flex h-full flex-col overflow-y-auto rounded-lg border"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              {/* Theme picker */}
              <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                <div
                  className="mb-2 text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Style
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((t) => {
                    const Icon = t.icon
                    const active = theme === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className="flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition"
                        style={{
                          borderColor: active ? 'var(--primary)' : 'var(--border)',
                          background: active ? 'var(--accent)' : 'transparent',
                          color: 'var(--ink)',
                          boxShadow: active ? '0 0 0 1px var(--primary) inset' : 'none',
                        }}
                      >
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          <Icon className="h-3.5 w-3.5" />
                          {t.label}
                        </div>
                        <div className="text-xs leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                          {t.description}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Page size */}
              <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                <label className="flex flex-col gap-1.5">
                  <span
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Page size
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value as PageSize)}
                    className="rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <option value="letter">US Letter (8.5 × 11 in)</option>
                    <option value="a4">A4 (210 × 297 mm)</option>
                  </select>
                </label>
              </div>

              {/* Typography knobs */}
              <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Typography
                  </div>
                  <button
                    onClick={resetTypo}
                    className="flex items-center gap-1 text-xs hover:underline"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <Slider
                    label="Text size"
                    value={typography.fontScale}
                    min={0.75}
                    max={1.4}
                    step={0.05}
                    display={`${Math.round(typography.fontScale * 100)}%`}
                    onChange={(v) => updateTypo('fontScale', v)}
                  />
                  <Slider
                    label="Line height"
                    value={typography.lineHeight}
                    min={1.2}
                    max={2.2}
                    step={0.05}
                    display={typography.lineHeight.toFixed(2)}
                    onChange={(v) => updateTypo('lineHeight', v)}
                  />
                  <Slider
                    label="Paragraph spacing"
                    value={typography.paragraphSpacing}
                    min={0.5}
                    max={2}
                    step={0.05}
                    display={`${Math.round(typography.paragraphSpacing * 100)}%`}
                    onChange={(v) => updateTypo('paragraphSpacing', v)}
                  />
                  <Slider
                    label="Letter spacing"
                    value={typography.letterSpacing}
                    min={-0.04}
                    max={0.08}
                    step={0.005}
                    display={`${(typography.letterSpacing * 1000).toFixed(0)}`}
                    onChange={(v) => updateTypo('letterSpacing', v)}
                  />
                  <Slider
                    label="Page margin"
                    value={typography.pageMargin}
                    min={0.6}
                    max={1.4}
                    step={0.05}
                    display={`${Math.round(typography.pageMargin * 100)}%`}
                    onChange={(v) => updateTypo('pageMargin', v)}
                  />
                  <div className="flex flex-wrap gap-3 pt-1">
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink)' }}>
                      <input
                        type="checkbox"
                        checked={typography.justify}
                        onChange={(e) => updateTypo('justify', e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Justify
                    </label>
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink)' }}>
                      <input
                        type="checkbox"
                        checked={typography.hyphenate}
                        onChange={(e) => updateTypo('hyphenate', e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Hyphenate
                    </label>
                  </div>
                </div>
              </div>

              {/* Document */}
              <div className="p-4">
                <div
                  className="mb-2 text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Document
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handlePasteFromClipboard}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <ClipboardPaste className="h-4 w-4" />
                    Paste from clipboard
                  </button>
                  <button
                    onClick={handleLoadSample}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <FileText className="h-4 w-4" />
                    Load sample
                  </button>
                  {!isEmpty && (
                    <button
                      onClick={handleClear}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear document
                    </button>
                  )}
                </div>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  Or just press <kbd className="font-mono">Ctrl/Cmd+V</kbd> anywhere on the page.
                  The first <code className="font-mono">#</code> heading becomes the document title.
                </p>
              </div>
            </div>
          </aside>
        )}

        <section className="min-w-0">
          <div
            className="no-print mb-4 flex items-center justify-between text-xs"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <span className="uppercase tracking-wider">
              {THEMES.find((t) => t.id === theme)?.label}
            </span>
            <span>{pageSize === 'letter' ? '8.5 × 11 in' : '210 × 297 mm'}</span>
          </div>
          <div
            id="print-root"
            className={pasteFlash ? 'paste-flash' : ''}
          >
            <PrintDocument
              markdown={markdown}
              pageSize={pageSize}
              theme={theme}
              typography={typography}
              onMarkdownChange={(md) => {
                setMarkdown(md)
                flashPaste()
              }}
            />
          </div>
          <div
            className="no-print mt-6 text-center text-xs italic"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {'Tip: in your print dialog, enable "Headers and footers" if you want page numbers.'}
          </div>
        </section>
      </div>
    </main>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink)' }}>
        <span>{label}</span>
        <span className="font-mono tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer accent-current"
        style={{ color: 'var(--primary)' }}
      />
    </label>
  )
}
