import { useLayoutEffect, useRef, type RefObject } from 'react'

import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from '../../../../presentation/shared/motion/motionSpring'

interface EntryPresentation {
  readonly layoutX: number
  axis: SpringAxis
}

// The dock lays out the committed bindings immediately. Only surviving entries
// retain their old visual positions while the gap closes; no stale binding lives on.
export function useQuickExecutionLayoutMotion(
  rootRef: RefObject<HTMLDivElement | null>,
  scope: string,
  enabled: boolean
): void {
  const reducedMotion = usePrefersReducedMotion()
  const entriesRef = useRef(new Map<HTMLElement, EntryPresentation>())
  const scopeRef = useRef(scope)
  const frameRef = useRef<number | null>(null)
  const timestampRef = useRef(0)
  const naturalWidthRef = useRef(0)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const previous = entriesRef.current
    const next = new Map<HTMLElement, EntryPresentation>()
    root.style.removeProperty('min-width')
    const bounds = root.getBoundingClientRect()
    const right = bounds.right
    naturalWidthRef.current = bounds.width
    const animate = enabled && !reducedMotion && scopeRef.current === scope
    scopeRef.current = scope
    const elements = root.querySelectorAll<HTMLElement>(
      '[data-quick-execution-slots="dock"] [data-quick-execution-slot]'
    )
    for (const element of elements) {
      const old = previous.get(element)
      const layoutX = element.getBoundingClientRect().left - right - (old?.axis.value ?? 0)
      const axis =
        animate && old
          ? retargetSpringAxis(
              {
                value: old.layoutX + old.axis.value - layoutX,
                velocity: old.axis.velocity
              },
              0,
              'toward-target-only'
            )
          : { value: 0, velocity: 0 }
      next.set(element, { layoutX, axis })
      present(element, axis)
    }
    for (const element of previous.keys()) {
      if (!next.has(element)) element.style.removeProperty('translate')
    }
    entriesRef.current = next
    const reserveMovingEntries = (): void => {
      const width = Math.max(
        naturalWidthRef.current,
        ...[...entriesRef.current.values()].map(({ layoutX, axis }) => -layoutX - axis.value)
      )
      // Keep the adjacent path out of the old visual footprint until the
      // entries reach their new layout. This changes only the small dock.
      if (width > naturalWidthRef.current) root.style.setProperty('min-width', `${width}px`)
      else root.style.removeProperty('min-width')
    }
    reserveMovingEntries()
    const hasMotion = () => [...entriesRef.current.values()].some(({ axis }) => axis.value !== 0)
    if (!hasMotion() && frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    if (!hasMotion() || frameRef.current !== null) return
    timestampRef.current = window.performance.now()
    const advance = (timestamp: number): void => {
      frameRef.current = null
      const elapsed = Math.max(0, (timestamp - timestampRef.current) / 1000)
      timestampRef.current = timestamp
      for (const [element, entry] of entriesRef.current) {
        entry.axis = advanceSpringAxis(entry.axis, 0, { dampingRatio: 1, response: 0.32 }, elapsed)
        if (isSpringAxisSettled(entry.axis, 0, { value: 0.01, speed: 0.1 })) {
          entry.axis = { value: 0, velocity: 0 }
        }
        present(element, entry.axis)
      }
      reserveMovingEntries()
      if (hasMotion()) frameRef.current = window.requestAnimationFrame(advance)
    }
    frameRef.current = window.requestAnimationFrame(advance)
  })

  useLayoutEffect(() => {
    const root = rootRef.current
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      for (const element of entriesRef.current.keys()) element.style.removeProperty('translate')
      entriesRef.current.clear()
      root?.style.removeProperty('min-width')
    }
  }, [rootRef])
}

function present(element: HTMLElement, axis: SpringAxis): void {
  if (axis.value === 0) element.style.removeProperty('translate')
  else element.style.setProperty('translate', `${axis.value}px 0`)
}
