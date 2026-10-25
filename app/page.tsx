'use client'

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  PrintDocument,
  type Theme,
  type PageSize,
  type TypographySettings,
  type TextAlign,
  DEFAULT_TYPOGRAPHY,
} from '@/components/print-document'
import { SAMPLE_MARKDOWN } from '@/lib/sample-markdown'
import { documentTitle } from '@/lib/title'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { sanitizeFilename } from '@/lib/filename'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_THEME,
  STORAGE_KEYS,
  TYPO_RANGES,
  bool,
  normalizePageSize,
  normalizeTheme,
  normalizeTypography,
} from '@/lib/settings'
import { useHotkeys, isTextField } from '@/hooks/use-hotkeys'
import { useIsClient, useMediaQuery } from '@/hooks/use-media-query'
import { SourceEditor } from '@/components/source-editor'
import { Toast, type ToastData } from '@/components/toast'
import { ViewModeToggle, type ViewMode } from '@/components/view-mode-toggle'
import { RecentDocuments } from '@/components/recent-documents'
import { PagesView, type PagesViewHandle } from '@/components/pages-view'
import {
  clearHistory,
  deleteHistory,
  listHistory,
  newDocId,
  saveHistory,
  titleFor,
  type HistoryEntry,
} from '@/lib/history'
import {
  PageFurnitureOverlay,
  PageFurnitureSection,
  useMarginBoxSupport,
  usePrintStyles,
} from '@/components/page-furniture'
import {
  DEFAULT_PRINT,
  PRINT_STORAGE_KEY,
  hasFurniture,
  normalizePrintSettings,
  type PrintSettings,
} from '@/lib/print-settings'
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
  FolderOpen,
  Keyboard,
  Check,
} from 'lucide-react'
import { onRadioKeyDown } from '@/lib/roving-radio'

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

// Stored settings are validated on every read (see lib/settings.ts).
const normalizeTypo = (v: unknown) => normalizeTypography(v, DEFAULT_TYPOGRAPHY)
const normalizeKeepHistory = (v: unknown) => bool(v, true)
const THEME_IDS = THEMES.map((t) => t.id)

export default function Page() {
  // Markdown is intentionally NOT persisted — every reload starts with a clean,
  // blinking-caret page so it's obvious you can paste/type fresh content.
  const [markdown, setMarkdown] = useState<string>('')
  const [pageSize, setPageSize] = useLocalStorage<PageSize>(STORAGE_KEYS.pageSize, DEFAULT_PAGE_SIZE, normalizePageSize)
  const [theme, setTheme] = useLocalStorage<Theme>(STORAGE_KEYS.theme, DEFAULT_THEME, normalizeTheme)
  const [typography, setTypography] = useLocalStorage<TypographySettings>(STORAGE_KEYS.typography, DEFAULT_TYPOGRAPHY, normalizeTypo)
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

  // ---- Editing & view mode ----
  const [viewMode, setViewMode] = useState<ViewMode>('source')
  const wide = useMediaQuery('(min-width: 1024px)')
  // Split needs room; on narrow screens it falls back to Source.
  const mode: ViewMode = viewMode === 'split' && !wide ? 'source' : viewMode
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const isClient = useIsClient()
  const mod = isClient && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

  // The rendered page lags the source by a short debounce while typing.
  const [preview, setPreview] = useState('')
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setDocument = (md: string) => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    setMarkdown(md)
    setPreview(md)
  }

  useEffect(() => {
    // Don't pull keyboard focus out of the view-mode radio group while the
    // user arrows through it.
    const active = document.activeElement
    if (active?.getAttribute('role') === 'radio' && active.matches(':focus-visible')) return
    if (mode === 'source' || mode === 'split') editorRef.current?.focus()
  }, [mode])

  const cycleMode = () => {
    // Same order as the toggle's buttons.
    const order: ViewMode[] = wide ? ['preview', 'source', 'split', 'pages'] : ['preview', 'source', 'pages']
    setViewMode(order[(order.indexOf(mode) + 1) % order.length])
  }

  // Make sure a print started right after typing shows the latest text.
  const flushPreview = useEffectEvent(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    flushSync(() => setPreview(markdown))
  })
  useEffect(() => {
    const onBeforePrint = () => flushPreview()
    window.addEventListener('beforeprint', onBeforePrint)
    return () => window.removeEventListener('beforeprint', onBeforePrint)
  }, [])

  // Split view: scale the page down to fit its column.
  const sectionRef = useRef<HTMLElement>(null)
  const [sectionWidth, setSectionWidth] = useState(0)
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSectionWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pagePx = pageSize === 'a4' ? 794 : 816
  const splitZoom = sectionWidth ? Math.min(1, ((sectionWidth - 24) / 2 - 8) / pagePx) : 1

  // ---- Local history (IndexedDB) ----
  const [keepHistory, setKeepHistory] = useLocalStorage<boolean>(STORAGE_KEYS.keepHistory, true, normalizeKeepHistory)
  const [history, setHistory] = useState<{ entries: HistoryEntry[]; now: number } | null>(null)
  const [offerClearHistory, setOfferClearHistory] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)
  const lastSaved = useRef('')

  const refreshHistory = useCallback(() => {
    void listHistory().then((entries) => setHistory(entries ? { entries, now: Date.now() } : null))
  }, [])
  useEffect(() => {
    refreshHistory()
    const t = setInterval(() => setHistory((h) => h && { ...h, now: Date.now() }), 60_000)
    return () => clearInterval(t)
  }, [refreshHistory])

  const saveToHistory = (md: string, id: string | null, t: Theme = theme, size: PageSize = pageSize) => {
    if (!keepHistory || !id || !md.trim()) return
    const key = [id, t, size, md].join('\0')
    if (lastSaved.current === key) return
    lastSaved.current = key
    void saveHistory({ id, title: titleFor(md), markdown: md, updatedAt: Date.now(), theme: t, pageSize: size }).then(
      refreshHistory,
    )
  }
  const saveLater = useEffectEvent(() => saveToHistory(markdown, docId))
  useEffect(() => {
    if (!keepHistory || !markdown.trim()) return
    const t = setTimeout(saveLater, 1000)
    return () => clearTimeout(t)
  }, [markdown, docId, theme, pageSize, keepHistory])

  const handleKeepHistoryChange = (keep: boolean) => {
    setKeepHistory(keep)
    setOfferClearHistory(!keep && !!history?.entries.length)
    if (keep) lastSaved.current = ''
  }
  const handleClearHistory = () => {
    setOfferClearHistory(false)
    void clearHistory().then(refreshHistory)
  }
  const handleDeleteHistory = (id: string) => {
    void deleteHistory(id).then(refreshHistory)
  }

  // ---- Whole-document replacement with one level of undo ----
  type Snapshot = { markdown: string; docId: string | null; theme: Theme; pageSize: PageSize; mode: ViewMode }
  const undoRef = useRef<Snapshot | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  // Screen-reader announcement for replacements that don't show a toast
  // (e.g. pasting into an empty page).
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const showToast = (message: string, actionLabel?: string) =>
    setToast({ id: Date.now(), message, actionLabel })

  const replaceDocument = (
    next: string,
    opts: { id?: string; theme?: Theme; pageSize?: PageSize } = {},
  ) => {
    if (next === markdown && !opts.id) return
    saveToHistory(markdown, docId)
    if (markdown.trim()) {
      undoRef.current = { markdown, docId, theme, pageSize, mode }
      showToast(next.trim() ? 'Document replaced' : 'Cleared', 'Undo')
    } else {
      undoRef.current = null
      setToast(null)
      if (next.trim()) setAnnouncement({ id: Date.now(), text: `Document loaded: ${titleFor(next)}` })
    }
    const id = next.trim() ? (opts.id ?? newDocId()) : null
    setDocument(next)
    setDocId(id)
    if (opts.theme) setTheme(opts.theme)
    if (opts.pageSize) setPageSize(opts.pageSize)
    if (next.trim()) {
      if (mode === 'source') setViewMode('preview')
      flashPaste()
      saveToHistory(next, id, opts.theme, opts.pageSize)
    } else {
      if (mode === 'preview' || mode === 'pages') setViewMode('source')
      requestAnimationFrame(() => editorRef.current?.focus())
    }
  }

  const undoReplace = () => {
    const snap = undoRef.current
    if (!snap) return false
    undoRef.current = null
    saveToHistory(markdown, docId)
    setDocument(snap.markdown)
    setDocId(snap.docId)
    setTheme(snap.theme)
    setPageSize(snap.pageSize)
    setViewMode(snap.mode)
    setToast(null)
    return true
  }

  const handleEdit = (md: string) => {
    setMarkdown(md)
    if (!docId && md.trim()) setDocId(newDocId())
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => setPreview(md), 150)
  }

  const handleOpenHistory = (entry: HistoryEntry) => {
    if (entry.id === docId && entry.markdown === markdown) return
    replaceDocument(entry.markdown, { id: entry.id, theme: entry.theme, pageSize: entry.pageSize })
  }

  // ---- Open file / drag & drop ----
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const openFile = async (file: File) => {
    const textLike = /\.(md|markdown|mdown|mkd|txt)$/i.test(file.name) || file.type.startsWith('text/')
    if (!textLike) {
      showToast(`Can't open ${file.name} — use a .md or .txt file`)
      return
    }
    const text = await file.text()
    if (!text.trim()) {
      showToast(`${file.name} is empty`)
      return
    }
    replaceDocument(text)
  }

  const onDragEvent = useEffectEvent((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    if (e.type === 'dragenter') {
      dragDepth.current++
      setDragging(true)
    } else if (e.type === 'dragleave') {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    } else if (e.type === 'dragover') {
      e.dataTransfer.dropEffect = 'copy'
    } else if (e.type === 'drop') {
      dragDepth.current = 0
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) void openFile(file)
    }
  })
  useEffect(() => {
    const types = ['dragenter', 'dragleave', 'dragover', 'drop'] as const
    const listener = (e: DragEvent) => onDragEvent(e)
    for (const t of types) window.addEventListener(t, listener)
    return () => {
      for (const t of types) window.removeEventListener(t, listener)
    }
  }, [])

  useHotkeys({
    e: () => cycleMode(),
    o: () => fileInputRef.current?.click(),
    s: () => {
      if (markdown.trim()) handleDownloadMd()
    },
    z: (e) => !isTextField(e.target) && undoReplace(),
    // In Pages view, wait for an up-to-date pagination before printing.
    p: () => {
      if (mode !== 'pages') return false
      void handlePrint()
    },
  })

  // Global paste — anywhere in the window. We avoid stealing paste from real
  // text fields (the source editor, number inputs etc.) so they work normally.
  const onWindowPaste = useEffectEvent((e: ClipboardEvent) => {
    if (isTextField(e.target)) return
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text.trim()) return
    e.preventDefault()
    replaceDocument(text)
  })
  useEffect(() => {
    const handler = (e: ClipboardEvent) => onWindowPaste(e)
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  // Update document.title from first heading
  useEffect(() => {
    const firstHeading = documentTitle(markdown)
    document.title = firstHeading ? `${firstHeading} | PRINTABLE.md` : 'PRINTABLE.md'
  }, [markdown])

  // Print engine: @page size + margins (scaled by the Page margin slider) and
  // margin-box page numbers / header / footer, injected as
  // <style id="pp-page-size-style">. See lib/print-settings.ts.
  const [printSettings, setPrintSettings] = useLocalStorage<PrintSettings>(
    PRINT_STORAGE_KEY,
    DEFAULT_PRINT,
    normalizePrintSettings,
  )
  const marginBoxes = useMarginBoxSupport()
  const docTitle = useMemo(() => documentTitle(markdown), [markdown])
  usePrintStyles({
    pageSize,
    marginScale: typography.pageMargin,
    settings: printSettings,
    docTitle,
    theme,
    marginBoxes,
  })

  // Pages view: print once the pagination matches the document (it then prints
  // exactly those pages; if pagination failed it falls back to native print).
  const pagesRef = useRef<PagesViewHandle>(null)
  const printRootRef = useRef<HTMLDivElement>(null)
  const handlePrint = async () => {
    if (mode === 'pages' && pagesRef.current) {
      if (previewTimer.current) clearTimeout(previewTimer.current)
      flushSync(() => setPreview(markdown))
      await pagesRef.current.ready()
    }
    window.print()
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) replaceDocument(text)
    } catch {
      showToast('Could not read clipboard. Press Ctrl/Cmd+V anywhere on the page instead.')
    }
  }

  const handleClear = () => replaceDocument('')

  const handleLoadSample = () => replaceDocument(SAMPLE_MARKDOWN)

  const handleDownloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const firstHeading = documentTitle(markdown) ?? 'document'
    a.href = url
    a.download = `${sanitizeFilename(firstHeading)}.md`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const isEmpty = markdown.trim().length === 0

  return (
    <div className="app-shell min-h-screen">
      <a href="#document" className="skip-link no-print">
        Skip to document
      </a>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement && <span key={announcement.id}>{announcement.text}</span>}
      </div>
      <header
        className="no-print sticky top-0 z-30 border-b backdrop-blur-md"
        style={{
          background: 'color-mix(in oklch, var(--background) 88%, transparent)',
          borderColor: 'var(--border)',
        }}
      >
        <p id="paste-hint" className="sr-only">
          Press {mod}V anywhere outside a text field to paste markdown and replace the document, {mod}O to open a
          file, or use the Paste from clipboard button in the Document section.
        </p>
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              className="flex h-10 w-10 items-center justify-center rounded-md border transition hover:bg-secondary sm:h-9 sm:w-9"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              aria-label={showSidebar ? 'Hide settings sidebar' : 'Show settings sidebar'}
              aria-expanded={showSidebar}
              aria-controls={showSidebar ? 'settings' : undefined}
            >
              {showSidebar ? (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <div
              className="hidden h-9 w-9 items-center justify-center rounded-md sm:flex"
              style={{ background: 'var(--primary)' }}
              aria-hidden="true"
            >
              <FileText className="h-5 w-5" style={{ color: 'var(--primary-foreground)' }} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-xl" style={{ color: 'var(--ink)' }}>
                PRINTABLE.md
              </div>
              <div className="hidden text-xs sm:block" style={{ color: 'var(--muted-foreground)' }}>
                Paste markdown. Print beautifully.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              aria-label="Paste from clipboard"
              aria-describedby="paste-hint"
              className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary sm:inline-flex"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
              Paste
            </button>
            {!isEmpty && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear document"
                className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary sm:inline-flex"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadMd}
              disabled={isEmpty}
              aria-label="Download .md file"
              className="hidden items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-secondary disabled:opacity-40 sm:inline-flex"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              .md
            </button>
            <ViewModeToggle mode={mode} onChange={setViewMode} allowSplit={wide} shortcut={`${mod}E`} />
            <button
              type="button"
              onClick={handlePrint}
              disabled={isEmpty}
              aria-label="Print"
              className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md px-2.5 py-2 text-sm sm:min-h-0 sm:px-4 font-semibold shadow-sm transition hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {/* Icon only on phones: the header row must fit 390px with four view modes. */}
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>
      </header>

      <div
        className={`mx-auto grid ${mode === 'split' ? 'max-w-[2400px]' : 'max-w-[1500px]'} gap-6 px-6 py-6 ${
          showSidebar ? 'lg:grid-cols-[360px_1fr]' : ''
        }`}
      >
        {showSidebar && (
          <aside id="settings" aria-label="Settings" className="no-print lg:sticky lg:top-[88px] lg:h-[calc(100vh-104px)]">
            <div
              className="flex h-full flex-col overflow-y-auto rounded-lg border"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              {/* Theme picker */}
              <section aria-labelledby="style-heading" className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                <h2
                  id="style-heading"
                  className="mb-2 text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Style
                </h2>
                <div role="radiogroup" aria-labelledby="style-heading" className="grid grid-cols-2 gap-2">
                  {THEMES.map((t) => {
                    const Icon = t.icon
                    const active = theme === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={t.label}
                        aria-describedby={`theme-desc-${t.id}`}
                        tabIndex={active ? 0 : -1}
                        onClick={() => setTheme(t.id)}
                        onKeyDown={(e) => onRadioKeyDown(e, THEME_IDS, theme, setTheme)}
                        className="theme-card relative flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition"
                        style={{
                          borderColor: active ? 'var(--primary)' : 'var(--border)',
                          background: active ? 'var(--accent)' : 'transparent',
                          color: 'var(--ink)',
                          boxShadow: active ? '0 0 0 1px var(--primary) inset' : 'none',
                        }}
                      >
                        {active && (
                          <Check
                            className="absolute right-2 top-2 h-3.5 w-3.5"
                            style={{ color: 'var(--primary)' }}
                            aria-hidden="true"
                          />
                        )}
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {t.label}
                        </div>
                        <div id={`theme-desc-${t.id}`} className="text-xs leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                          {t.description}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

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

              {/* Header & footer (page numbers, running header, footer) */}
              <PageFurnitureSection
                settings={printSettings}
                onChange={setPrintSettings}
                supported={marginBoxes}
              />

              {/* Typography knobs */}
              <section aria-labelledby="typography-heading" className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-3 flex items-center justify-between">
                  <h2
                    id="typography-heading"
                    className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                    Typography
                  </h2>
                  <button
                    type="button"
                    onClick={resetTypo}
                    aria-label="Reset typography"
                    className="flex items-center gap-1 text-xs hover:underline"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Reset
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <Slider
                    label="Text size"
                    value={typography.fontScale}
                    min={TYPO_RANGES.fontScale.min}
                    max={TYPO_RANGES.fontScale.max}
                    step={0.05}
                    display={`${Math.round(typography.fontScale * 100)}%`}
                    onChange={(v) => updateTypo('fontScale', v)}
                  />
                  <Slider
                    label="Line height"
                    value={typography.lineHeight}
                    min={TYPO_RANGES.lineHeight.min}
                    max={TYPO_RANGES.lineHeight.max}
                    step={0.05}
                    display={typography.lineHeight.toFixed(2)}
                    onChange={(v) => updateTypo('lineHeight', v)}
                  />
                  <Slider
                    label="Paragraph spacing"
                    value={typography.paragraphSpacing}
                    min={TYPO_RANGES.paragraphSpacing.min}
                    max={TYPO_RANGES.paragraphSpacing.max}
                    step={0.05}
                    display={`${Math.round(typography.paragraphSpacing * 100)}%`}
                    onChange={(v) => updateTypo('paragraphSpacing', v)}
                  />
                  <Slider
                    label="Letter spacing"
                    value={typography.letterSpacing}
                    min={TYPO_RANGES.letterSpacing.min}
                    max={TYPO_RANGES.letterSpacing.max}
                    step={0.005}
                    display={`${(typography.letterSpacing * 1000).toFixed(0)}`}
                    valueText={`${(typography.letterSpacing * 1000).toFixed(0)} thousandths of an em`}
                    onChange={(v) => updateTypo('letterSpacing', v)}
                  />
                  <Slider
                    label="Page margin"
                    value={typography.pageMargin}
                    min={TYPO_RANGES.pageMargin.min}
                    max={TYPO_RANGES.pageMargin.max}
                    step={0.05}
                    display={`${Math.round(typography.pageMargin * 100)}%`}
                    onChange={(v) => updateTypo('pageMargin', v)}
                  />
                  <div role="group" aria-label="Text options" className="flex flex-wrap gap-3 pt-1">
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink)' }}>
                      Align
                      <select
                        value={typography.align ?? 'theme'}
                        onChange={(e) =>
                          updateTypo('align', e.target.value === 'theme' ? undefined : (e.target.value as TextAlign))
                        }
                        className="rounded border bg-transparent px-1 py-0.5 text-xs"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <option value="theme">Theme default</option>
                        <option value="justify">Justify</option>
                        <option value="left">Left</option>
                      </select>
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
              </section>

              {/* Document */}
              <section aria-labelledby="document-actions-heading" className="p-4">
                <h2
                  id="document-actions-heading"
                  className="mb-2 text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Document
                </h2>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    Open…
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    aria-describedby="paste-hint"
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                    Paste from clipboard
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Load sample
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMd}
                    disabled={isEmpty}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary disabled:opacity-40"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download .md
                  </button>
                  {!isEmpty && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-secondary"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Clear document
                    </button>
                  )}
                </div>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  Or just press <kbd className="font-mono">Ctrl/Cmd+V</kbd> anywhere on the page, or drop a
                  file on it. The first <code className="font-mono">#</code> heading becomes the document title.
                </p>
              </section>

              {history && (
                <RecentDocuments
                  entries={history.entries}
                  now={history.now}
                  activeId={docId}
                  keepHistory={keepHistory}
                  offerClear={offerClearHistory}
                  onKeepHistoryChange={handleKeepHistoryChange}
                  onOpen={handleOpenHistory}
                  onDelete={handleDeleteHistory}
                  onClearAll={handleClearHistory}
                  onDismissOffer={() => setOfferClearHistory(false)}
                />
              )}

              <section aria-labelledby="shortcuts-heading" className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
                <h2
                  id="shortcuts-heading"
                  className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                  Shortcuts
                </h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--ink)' }}>
                  {[
                    ['E', 'Preview / Source / Split / Pages'],
                    ['O', 'Open file'],
                    ['S', 'Download .md'],
                    ['Z', 'Undo replace (outside the editor)'],
                    ['P', 'Print'],
                  ].map(([key, label]) => (
                    <div key={key} className="contents">
                      <dt>
                        <kbd className="font-mono" style={{ color: 'var(--muted-foreground)' }}>
                          {mod}
                          {key}
                        </kbd>
                      </dt>
                      <dd>{label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </aside>
        )}

        <main
          ref={sectionRef}
          id="document"
          tabIndex={-1}
          aria-label="Document"
          aria-describedby="paste-hint"
          className={`doc-view doc-view--${mode} min-w-0`}
          style={{ '--pp-split-zoom': splitZoom } as React.CSSProperties}
        >
          {(mode === 'source' || mode === 'split') && (
            <div className="source-pane no-print">
              <SourceEditor
                ref={editorRef}
                value={markdown}
                onChange={handleEdit}
                onPasteIntoEmpty={(text) => replaceDocument(text)}
              />
            </div>
          )}
          <div
            className="no-print mb-4 flex items-center justify-between text-xs"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <span className="uppercase tracking-wider">
              {THEMES.find((t) => t.id === theme)?.label}
            </span>
            <span>{pageSize === 'letter' ? '8.5 × 11 in' : '210 × 297 mm'}</span>
          </div>
          {mode === 'pages' && (
            <PagesView
              ref={pagesRef}
              printRoot={printRootRef}
              pageSize={pageSize}
              marginScale={typography.pageMargin}
              settings={printSettings}
              docTitle={docTitle}
              isEmpty={preview.trim().length === 0}
            />
          )}
          <div
            ref={printRootRef}
            id="print-root"
            className={pasteFlash ? 'paste-flash' : ''}
          >
            <PrintDocument
              markdown={preview}
              pageSize={pageSize}
              theme={theme}
              typography={typography}
              overlay={
                isEmpty ? null : (
                  <PageFurnitureOverlay
                    settings={printSettings}
                    pageSize={pageSize}
                    marginScale={typography.pageMargin}
                    docTitle={docTitle}
                    showFurniture={marginBoxes}
                  />
                )
              }
            />
          </div>
          <div
            className="no-print mt-6 text-center text-xs italic"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {mode === 'pages'
              ? 'Printing from Pages prints exactly these pages. In the print dialog keep Margins at Default (or None) and Scale at Default.'
              : !marginBoxes
                ? 'Tip: in your print dialog, enable "Headers and footers" if you want page numbers.'
                : hasFurniture(printSettings, docTitle)
                  ? 'Page numbers, header and footer come from the sidebar; the print dialog\'s "Headers and footers" option isn\'t needed. Dashed lines are approximate page breaks — open Pages to see the exact pages.'
                  : 'Tip: turn on page numbers or a header/footer in the sidebar. Dashed lines are approximate page breaks — open Pages to see the exact pages.'}
          </div>
        </main>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        aria-label="Open markdown file"
        tabIndex={-1}
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openFile(file)
        }}
      />
      {dragging && (
        <div
          className="no-print pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed"
          style={{
            borderColor: 'var(--primary)',
            background: 'color-mix(in oklch, var(--background) 70%, transparent)',
          }}
        >
          <div className="rounded-lg px-4 py-2 text-sm font-semibold shadow" style={{ background: 'var(--card)', color: 'var(--ink)' }}>
            Drop a markdown file to open it
          </div>
        </div>
      )}
      <Toast toast={toast} onAction={undoReplace} onDismiss={dismissToast} />
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  valueText = display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  /** Spoken value (aria-valuetext); defaults to the displayed value. */
  valueText?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--ink)' }}>
        <span>{label}</span>
        <span className="font-mono tabular-nums" style={{ color: 'var(--muted-foreground)' }} aria-hidden="true">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer accent-current"
        style={{ color: 'var(--primary)' }}
      />
    </label>
  )
}
