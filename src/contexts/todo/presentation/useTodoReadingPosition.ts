import { useLayoutEffect, type RefObject } from 'react'
import type { TodoSession } from './TodoSession'

export function useTodoReadingPosition(
  scroll: RefObject<HTMLDivElement | null>,
  groups: RefObject<HTMLDivElement | null>,
  reading: TodoSession['reading']
) {
  useLayoutEffect(() => {
    const body = scroll.current!
    const list = groups.current!
    const drawer = body.parentElement!
    const saved = reading.anchor
    const anchor = saved && list.querySelector<HTMLElement>(`[data-todo-entry="${saved.id}"]`)
    const restore = () => {
      body.scrollTop = anchor && saved ? anchor.offsetTop + saved.inset : reading.scrollTop
    }
    restore()
    // Lazy image previews can acquire their full height after the drawer is visible.
    const observer = new ResizeObserver(restore)
    if (anchor) observer.observe(list)
    const release = () => observer.disconnect()
    drawer.addEventListener('wheel', release, { passive: true, capture: true })
    drawer.addEventListener('pointerdown', release, true)
    drawer.addEventListener('keydown', release, true)
    return () => {
      release()
      drawer.removeEventListener('wheel', release, true)
      drawer.removeEventListener('pointerdown', release, true)
      drawer.removeEventListener('keydown', release, true)
      reading.scrollTop = body.scrollTop
      const rows = list.querySelectorAll<HTMLElement>('[data-todo-entry]')
      const first =
        body.scrollTop > 0 &&
        (Array.from(rows).find((row) => row.offsetTop >= body.scrollTop) ?? rows[rows.length - 1])
      reading.anchor = first
        ? { id: first.dataset.todoEntry!, inset: body.scrollTop - first.offsetTop }
        : undefined
    }
  }, [scroll, groups, reading])
}
