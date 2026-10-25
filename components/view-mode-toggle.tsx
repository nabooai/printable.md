'use client'

import { Columns2, Eye, FileCode } from 'lucide-react'
import { onRadioKeyDown } from '@/lib/roving-radio'

export type ViewMode = 'preview' | 'source' | 'split'

const MODES: { id: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'source', label: 'Source', icon: FileCode },
  { id: 'split', label: 'Split', icon: Columns2 },
]

export function ViewModeToggle({
  mode,
  onChange,
  allowSplit,
  shortcut,
}: {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  allowSplit: boolean
  shortcut: string
}) {
  const modes = MODES.filter((m) => allowSplit || m.id !== 'split')
  const ids = modes.map((m) => m.id)
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex items-center rounded-md border p-0.5"
      style={{ borderColor: 'var(--border)' }}
    >
      {modes.map((m) => {
        const Icon = m.icon
        const active = mode === m.id
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-label={m.label}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(m.id)}
            onKeyDown={(e) => onRadioKeyDown(e, ids, mode, onChange)}
            title={`${m.label} (${shortcut} to cycle)`}
            className="inline-flex h-9 min-w-10 items-center justify-center gap-1.5 rounded px-2.5 text-sm font-medium transition sm:h-7 sm:min-w-0"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--muted-foreground)',
              boxShadow: active ? '0 0 0 1px var(--border) inset' : 'none',
            }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}
