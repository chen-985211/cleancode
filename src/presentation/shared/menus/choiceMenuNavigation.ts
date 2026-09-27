import type { KeyboardEvent } from 'react'

export type ChoiceMenuInitialFocus = 'container' | 'first' | 'last'

const choices = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).filter(
    (item) =>
      !item.disabled &&
      (item.getAttribute('role') === 'menuitem' || item.getAttribute('role') === 'menuitemradio')
  )

export function focusChoiceMenu(
  menu: HTMLElement | null,
  boundary: ChoiceMenuInitialFocus = 'container'
): boolean {
  if (!menu) return false
  const items = choices(menu)
  const target =
    boundary === 'container' ? menu : ((boundary === 'first' ? items[0] : items.at(-1)) ?? menu)
  target.focus({ preventScroll: true })
  if (target !== menu) target.scrollIntoView?.({ block: 'nearest' })
  return true
}

export function navigateChoiceMenu(event: KeyboardEvent<HTMLElement>, close: () => void): void {
  event.stopPropagation()
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault()
    close()
    return
  }
  const items = choices(event.currentTarget)
  const index = items.indexOf(event.target as HTMLButtonElement)
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    items[index]?.click()
    return
  }
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? (index + 1) % items.length
          : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
            ? index < 0
              ? items.length - 1
              : (index - 1 + items.length) % items.length
            : null
  if (next === null) return
  event.preventDefault()
  items[next]?.focus({ preventScroll: true })
  items[next]?.scrollIntoView?.({ block: 'nearest' })
}
