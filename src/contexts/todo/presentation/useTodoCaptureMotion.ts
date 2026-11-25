import { useLayoutEffect, useRef, type RefObject } from 'react'

type Handoff = {
  inserted: string[]
  previousNeighbor: HTMLElement | null
  neighborTop: number
  listTop: number
  editorTop: number
  continuing: boolean
}

export function useTodoCaptureMotion(
  capture: RefObject<HTMLDivElement | null>,
  list: RefObject<HTMLDivElement | null>
) {
  const pending = useRef<Handoff | null>(null)
  useLayoutEffect(() => {
    const handoff = pending.current
    pending.current = null
    const slot = capture.current
    const body = list.current
    if (!handoff || !slot?.animate || !body) return
    const style = getComputedStyle(slot)
    const timing = {
      duration: parseFloat(style.getPropertyValue('--cc-motion-duration-todo-confirm')),
      easing: style.getPropertyValue('--cc-easing-todo-confirm').trim()
    }
    const entries = handoff.inserted.map((id) =>
      body.querySelector<HTMLElement>(`[data-todo-entry="${id}"]`)
    )
    if (handoff.continuing || entries.length > 1) {
      // Each insertion owns its space. Its spring keeps running when the next row arrives.
      for (const entry of entries)
        entry?.animate(
          [
            {
              height: '0px',
              marginBottom: 'calc(-1 * var(--todo-list-inset))',
              opacity: 0,
              overflow: 'clip'
            },
            { height: 'auto', marginBottom: '0px', opacity: 1, overflow: 'clip' }
          ],
          timing
        )
    }
    let offset = handoff.listTop - body.getBoundingClientRect().top
    if (handoff.previousNeighbor?.isConnected) {
      offset = handoff.neighborTop - handoff.previousNeighbor.getBoundingClientRect().top
    } else if (!handoff.continuing && entries.length === 1 && entries[0]) {
      offset = handoff.editorTop - entries[0].getBoundingClientRect().top
    }
    if (Math.abs(offset) > 0.25) {
      // Add the new displacement to any unfinished correction, preserving its velocity.
      slot.animate([{ marginBottom: offset + 'px' }, { marginBottom: '0px' }], {
        ...timing,
        composite: 'add'
      })
    }
    if (!handoff.continuing)
      slot.querySelector('.todo-new')?.animate([{ opacity: 0 }, { opacity: 1 }], timing)
  })
  return (inserted: string[], continuing: boolean) => {
    const body = list.current
    const editor = capture.current?.querySelector('.todo-row')
    if (!body || !editor) return
    const neighbor = body.querySelector<HTMLElement>('[data-todo-entry]')
    pending.current = {
      inserted,
      continuing,
      previousNeighbor: neighbor,
      neighborTop: neighbor?.getBoundingClientRect().top ?? 0,
      listTop: body.getBoundingClientRect().top,
      editorTop: editor.getBoundingClientRect().top
    }
  }
}
