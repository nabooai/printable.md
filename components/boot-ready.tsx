'use client'

import { useEffect } from 'react'
import { BOOT_ATTR } from '@/lib/boot-script'

/**
 * Ends the boot phase started by the inline script in app/layout.tsx.
 * Hydration renders the defaults (server snapshot); stored settings are
 * applied by a sync re-render right after hydration's effects. Two frames
 * later the real settings are on screen, so reveal the UI with a short fade.
 */
export function BootReady() {
  useEffect(() => {
    const root = document.documentElement
    if (root.getAttribute(BOOT_ATTR) !== 'pending') return
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        root.setAttribute(BOOT_ATTR, 'done')
        fadeTimer = setTimeout(() => root.removeAttribute(BOOT_ATTR), 200)
      })
    })
    return () => {
      cancelAnimationFrame(raf)
      if (fadeTimer) clearTimeout(fadeTimer)
    }
  }, [])
  return null
}
