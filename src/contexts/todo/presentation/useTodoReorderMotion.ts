import { useLayoutEffect, useRef, type RefObject } from 'react'

function visibleRows(body: HTMLElement) {
  const bounds = body.getBoundingClientRect()
  const positions = new Map<HTMLElement, { top: number; slotTop: number }>()
  for (const row of body.querySelectorAll<HTMLElement>('[data-todo-position]')) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom > bounds.top && rect.top < bounds.bottom) {
      positions.set(row, { top: rect.top, slotTop: row.parentElement!.getBoundingClientRect().top })
    }
  }
  return positions
}

export function useTodoReorderMotion(scroll: RefObject<HTMLDivElement | null>) {
  const before = useRef<{ positions: ReturnType<typeof visibleRows>; changedId: string } | null>(
    null
  )
  const moving = useRef(new Map<HTMLElement, Animation>())
  useLayoutEffect(() => {
    const animations = moving.current
    return () => {
      for (const animation of animations.values()) animation.cancel()
      animations.clear()
    }
  }, [])

  useLayoutEffect(() => {
    const source = before.current
    before.current = null
    const body = scroll.current
    if (!source || !body?.animate) return
    const styles = getComputedStyle(body)
    const press = parseFloat(styles.getPropertyValue('--cc-motion-duration-press'))
    const timing: KeyframeAnimationOptions = {
      duration: parseFloat(styles.getPropertyValue('--cc-motion-duration-todo-confirm')),
      easing: styles.getPropertyValue('--cc-easing-todo-confirm').trim(),
      fill: 'backwards'
    }
    for (const [row, origin] of source.positions) {
      if (!row.isConnected) continue
      // The wrapper is the layout slot. The row inside it can still be in flight.
      const slotTop = row.parentElement!.getBoundingClientRect().top
      if (Math.abs(origin.slotTop - slotTop) < 1) continue
      const previous = moving.current.get(row)
      previous?.cancel()
      moving.current.delete(row)
      const distance = origin.top - slotTop
      if (Math.abs(distance) < 1) continue
      const layer = row.dataset.todoPosition === source.changedId ? '2' : 'auto'
      const animation = row.animate(
        [
          { translate: '0 ' + distance + 'px', zIndex: layer },
          { translate: '0 0', zIndex: layer }
        ],
        { ...timing, delay: previous ? 0 : press }
      )
      moving.current.set(row, animation)
      animation.onfinish = () => {
        if (moving.current.get(row) === animation) moving.current.delete(row)
      }
    }
  })

  return (changedId: string) => {
    if (!scroll.current) return
    before.current = { positions: visibleRows(scroll.current), changedId }
  }
}
