'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Settings persistence on top of useSyncExternalStore:
//  - Hydration-safe: the server snapshot (and so the static HTML and the
//    hydration pass) is always `initial`; React re-renders with the stored
//    value right after hydrating, without a mismatch.
//  - Every hook instance using the same key stays in sync, in this tab (an
//    in-app emitter) and across tabs (the `storage` event).
//  - Never throws: localStorage access can fail (private mode, quota,
//    SecurityError when storage is blocked) and stored JSON can be anything.
//    Pass `normalize` to validate the parsed value; it falls back to defaults.
//    When storage is unusable, values live in memory for this page load.

type Normalize<T> = (raw: unknown) => T

const listeners = new Map<string, Set<() => void>>()
/** Values that couldn't be written to localStorage (raw JSON strings). */
const memory = new Map<string, string>()
/** Last raw string seen per key → parsed value, so snapshots are referentially stable. */
const cache = new Map<string, { raw: string | null; normalize: unknown; value: unknown }>()

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, raw: string) {
  try {
    window.localStorage.setItem(key, raw)
    memory.delete(key)
  } catch {
    memory.set(key, raw)
  }
}

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l())
}

function parse<T>(raw: string | null, initial: T, normalize?: Normalize<T>): T {
  if (raw === null) return initial
  try {
    const parsed: unknown = JSON.parse(raw)
    return normalize ? normalize(parsed) : (parsed as T)
  } catch {
    return initial
  }
}

/**
 * Persist a value in localStorage under `key`. `normalize` receives the parsed
 * JSON (unknown shape) and must return a valid T; use it for anything a
 * corrupted value could break. Keep `initial` and `normalize` stable
 * (module-level constants/functions).
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
  normalize?: Normalize<T>,
): [T, (v: T) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let set = listeners.get(key)
      if (!set) listeners.set(key, (set = new Set()))
      set.add(onChange)
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) {
          memory.delete(key)
          onChange()
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        set.delete(onChange)
        window.removeEventListener('storage', onStorage)
      }
    },
    [key],
  )

  const getSnapshot = useCallback((): T => {
    const raw = readRaw(key)
    const hit = cache.get(key)
    if (hit && hit.raw === raw && hit.normalize === normalize) return hit.value as T
    const value = parse(raw, initial, normalize)
    cache.set(key, { raw, normalize, value })
    return value
  }, [key, initial, normalize])

  const getServerSnapshot = useCallback(() => initial, [initial])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setValue = useCallback(
    (v: T) => {
      let raw: string
      try {
        raw = JSON.stringify(v)
      } catch {
        return
      }
      if (raw === undefined) return
      writeRaw(key, raw)
      emit(key)
    },
    [key],
  )

  return [value, setValue]
}
