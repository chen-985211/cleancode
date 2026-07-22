import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

const focusableSelector = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

export function trapFocus(
  event: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement | null
): void {
  if (event.key !== 'Tab' || !container) return
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true'
  )
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) {
    event.preventDefault()
    container.focus()
    return
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

export function inertOutside(element: HTMLElement): () => void {
  const previous = new Map<HTMLElement, boolean>()
  let current: HTMLElement = element
  while (current.parentElement) {
    const parent = current.parentElement
    for (const sibling of Array.from(parent.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === current || previous.has(sibling))
        continue
      previous.set(sibling, sibling.inert)
      sibling.inert = true
    }
    if (parent === document.body) break
    current = parent
  }
  return () => {
    for (const [region, wasInert] of previous) region.inert = wasInert
  }
}
