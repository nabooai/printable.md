'use client'

import { useEffect, useEffectEvent } from 'react'

/** Cmd/Ctrl + key (no Shift/Alt). A handler returning false lets the event through. */
export type Hotkeys = Record<string, (e: KeyboardEvent) => boolean | void>

export function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useHotkeys(keys: Hotkeys) {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.isComposing) return
    const handler = keys[e.key.toLowerCase()]
    if (handler && handler(e) !== false) e.preventDefault()
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
}
