'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

export interface ToastData {
  id: number
  message: string
  actionLabel?: string
}

export function Toast({
  toast,
  onAction,
  onDismiss,
  duration = 6000,
}: {
  toast: ToastData | null
  onAction?: () => void
  /** Must be stable — a new function restarts the dismiss timer. */
  onDismiss: () => void
  duration?: number
}) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [toast, onDismiss, duration])

  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border py-2 pl-4 pr-2 text-sm shadow-lg"
      style={{ background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }}
    >
      <span>{toast.message}</span>
      {toast.actionLabel && onAction && (
        <button
          onClick={() => {
            onAction()
            onDismiss()
          }}
          className="rounded px-2 py-1 text-sm font-semibold underline-offset-2 hover:underline"
          style={{ color: 'var(--paper)' }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
