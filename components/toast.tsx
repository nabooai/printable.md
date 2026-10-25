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

  // The live region stays mounted so screen readers reliably announce each
  // message; the visual toast (with its buttons) is rendered separately.
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {toast && <span key={toast.id}>{toast.message}</span>}
      </div>
      {toast && (
        <div
          className="pp-toast no-print fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border py-2 pl-4 pr-2 text-sm shadow-lg"
          style={{ background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }}
        >
          <span aria-hidden="true">{toast.message}</span>
          {toast.actionLabel && onAction && (
            <button
              type="button"
              onClick={() => {
                onAction()
                onDismiss()
              }}
              className="min-h-9 rounded px-2 py-1 text-sm font-semibold underline-offset-2 hover:underline"
              style={{ color: 'var(--paper)' }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="flex h-9 w-9 items-center justify-center rounded opacity-80 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  )
}
