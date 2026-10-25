import type { KeyboardEvent } from 'react'

/**
 * Keyboard handling for a role="radiogroup" whose role="radio" children use a
 * roving tabindex (only the checked radio is tabbable). Arrow keys move to and
 * select the previous/next option (wrapping), Home/End jump to the ends — the
 * standard ARIA radio-group pattern. Attach to each radio's onKeyDown.
 */
export function onRadioKeyDown<T extends string>(
  e: KeyboardEvent<HTMLElement>,
  options: readonly T[],
  current: T,
  select: (value: T) => void,
) {
  const i = options.indexOf(current)
  let next: number
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (i + 1) % options.length
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (i - 1 + options.length) % options.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = options.length - 1
      break
    default:
      return
  }
  e.preventDefault()
  select(options[next])
  const group = e.currentTarget.closest('[role="radiogroup"]')
  group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
}
