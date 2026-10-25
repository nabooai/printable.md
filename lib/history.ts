// Recent documents, kept in IndexedDB on this device only. Every call resolves
// (never rejects): when IndexedDB is unavailable (private mode, blocked
// storage) reads return null and writes are no-ops.

import type { PageSize, Theme } from '@/components/print-document'

export interface HistoryEntry {
  id: string
  title: string
  markdown: string
  updatedAt: number
  theme: Theme
  pageSize: PageSize
}

const DB_NAME = 'printable-md'
const STORE = 'docs'
const MAX_ENTRIES = 30

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const tx = db.transaction(STORE, mode)
          const req = fn(tx.objectStore(STORE))
          tx.oncomplete = () => resolve(req ? req.result : null)
          tx.onerror = () => resolve(null)
          tx.onabort = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

/** Newest first; null when IndexedDB is unavailable. */
export async function listHistory(): Promise<HistoryEntry[] | null> {
  const all = await run<HistoryEntry[]>('readonly', (s) => s.getAll())
  if (!all) return null
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Upserts the entry, drops other entries with identical content, keeps the newest 30. */
export async function saveHistory(entry: HistoryEntry): Promise<void> {
  const all = (await listHistory()) ?? []
  const others = all.filter((e) => e.id !== entry.id)
  const dupes = others.filter((e) => e.markdown === entry.markdown)
  const overflow = others.filter((e) => e.markdown !== entry.markdown).slice(MAX_ENTRIES - 1)
  await run('readwrite', (s) => {
    s.put(entry)
    for (const e of [...dupes, ...overflow]) s.delete(e.id)
  })
}

export async function deleteHistory(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id))
}

export async function clearHistory(): Promise<void> {
  await run('readwrite', (s) => s.clear())
}

export function newDocId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** First H1, else the first non-empty line with markdown markers stripped. */
export function titleFor(md: string): string {
  const h1 = md.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]
  const line = h1 ?? md.split('\n').find((l) => l.trim()) ?? ''
  const clean = line.replace(/^[\s#>*+\-\d.`]+/, '').replace(/[*_`]/g, '').trim()
  return (clean || 'Untitled').slice(0, 80)
}

export function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
