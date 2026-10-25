'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** False during SSR/hydration, then tracks the query. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

const noopSubscribe = () => () => {}

/** True once running on the client (false in the server snapshot). */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}
