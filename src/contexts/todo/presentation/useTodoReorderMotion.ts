import { useLayoutEffect, useRef, type RefObject } from 'react'
import { usePrefersReducedMotion } from '../../../presentation/shared/hooks/usePrefersReducedMotion'

function visibleRows(scroll: HTMLElement) {
  const bounds = scroll.getBoundingClientRect()
  return Array.from(scroll.querySelectorAll<HTMLElement>('[data-todo-position]')).flatMap((el) => {
    const rect = el.getBoundingClientRect()
    return rect.bottom > bounds.top && rect.top < bounds.bottom
      ? [{ id: el.dataset.todoPosition!, el, top: rect.top }]
      : []
  })
}

// Only a status change moves items between groups. Editing, scrolling and resizing
// use their natural layout without replaying a previous reorder.
export function useTodoReorderMotion(scroll: RefObject<HTMLDivElement | null>) {
  const reduced = usePrefersReducedMotion()
  const before = useRef<Map<string, number> | null>(null)
  const moving = useRef(new Set<Animation>())
  useLayoutEffect(() => {
    const animations = moving.current
    return () => {
      before.current = null
      for (const animation of animations) animation.cancel()
      animations.clear()
    }
  }, [reduced])

  useLayoutEffect(() => {
    const positions = before.current
    before.current = null
    const body = scroll.current
    if (!body || !positions || reduced) return
    const styles = getComputedStyle(body)
    const duration = parseFloat(styles.getPropertyValue('--cc-motion-duration-surface'))
    const easing = styles.getPropertyValue('--cc-easing-enter').trim()
    for (const { id, el, top } of visibleRows(body)) {
      const original = positions.get(id)
      if (original === undefined || Math.abs(original - top) < 1) continue
      const animation = el.animate([{ translate: `0 ${original - top}px` }, { translate: '0 0' }], {
        duration,
        easing
      })
      moving.current.add(animation)
      animation.onfinish = () => moving.current.delete(animation)
    }
  })

  return () => {
    if (!scroll.current || reduced) return
    before.current = new Map(visibleRows(scroll.current).map(({ id, top }) => [id, top]))
    for (const animation of moving.current) animation.cancel()
    moving.current.clear()
  }
}
