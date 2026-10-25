'use client'

import { History, X } from 'lucide-react'
import { relativeTime, type HistoryEntry } from '@/lib/history'

export function RecentDocuments({
  entries,
  now,
  activeId,
  keepHistory,
  offerClear,
  onKeepHistoryChange,
  onOpen,
  onDelete,
  onClearAll,
  onDismissOffer,
}: {
  entries: HistoryEntry[]
  now: number
  activeId: string | null
  keepHistory: boolean
  offerClear: boolean
  onKeepHistoryChange: (keep: boolean) => void
  onOpen: (entry: HistoryEntry) => void
  onDelete: (id: string) => void
  onClearAll: () => void
  onDismissOffer: () => void
}) {
  return (
    <div className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-2 flex items-center justify-between">
        <div
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <History className="h-3.5 w-3.5" />
          Recent
        </div>
        {entries.length > 0 && !offerClear && (
          <button
            onClick={onClearAll}
            className="text-xs hover:underline"
            style={{ color: 'var(--muted-foreground)' }}
          >
            Clear history
          </button>
        )}
      </div>

      {entries.length > 0 ? (
        <ul className="-mx-1 flex max-h-64 flex-col overflow-y-auto">
          {entries.map((e) => {
            const active = e.id === activeId
            return (
              <li key={e.id} className="group flex items-center rounded-md hover:bg-secondary">
                <button
                  onClick={() => onOpen(e)}
                  className="flex min-w-0 flex-1 items-baseline justify-between gap-2 px-2 py-1.5 text-left text-sm"
                  style={{ color: 'var(--ink)' }}
                  title={e.title}
                >
                  <span className={`truncate ${active ? 'font-semibold' : ''}`}>{e.title}</span>
                  <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                    {relativeTime(e.updatedAt, now)}
                  </span>
                </button>
                <button
                  onClick={() => onDelete(e.id)}
                  aria-label={`Remove “${e.title}” from history`}
                  className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 transition group-hover:opacity-70 hover:!opacity-100 focus:opacity-100"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          {keepHistory
            ? 'Documents you paste, open or edit show up here.'
            : 'History is off.'}
        </p>
      )}

      {offerClear && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          <span className="flex-1">
            Delete the {entries.length} saved document{entries.length === 1 ? '' : 's'} too?
          </span>
          <button
            onClick={onClearAll}
            className="rounded border px-2 py-1 font-medium hover:bg-secondary"
            style={{ borderColor: 'var(--border)' }}
          >
            Delete
          </button>
          <button onClick={onDismissOffer} className="px-1 py-1 hover:underline">
            Keep
          </button>
        </div>
      )}

      <label className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink)' }}>
        <input
          type="checkbox"
          checked={keepHistory}
          onChange={(e) => onKeepHistoryChange(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Keep history on this device
      </label>
    </div>
  )
}
