import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import {
  createSelectionFeedbackMotionController,
  createSelectionIndicatorMotionController
} from './selectionMotion'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

type ElementRefCallback = (element: HTMLElement | null) => void

type SelectionIndicatorMotionRefs = readonly [ElementRefCallback, ElementRefCallback]
const emptyTarget = { height: 0, width: 0, x: 0, y: 0 }

export function useSelectionIndicatorMotion(selectedKey: string): SelectionIndicatorMotionRefs {
  const containerRootRef = useRef<HTMLElement | null>(null)
  const indicatorRootRef = useRef<HTMLElement | null>(null)
  const projectionFrameRef = useRef<number | null>(null)
  const selectedKeyRef = useRef(selectedKey)
  const reducedMotionRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()
  const controller = useMemo(() => createSelectionIndicatorMotionController(), [])
  selectedKeyRef.current = selectedKey
  reducedMotionRef.current = reducedMotion

  const project = useCallback(
    (settleImmediately: boolean): boolean => {
      const root = indicatorRootRef.current
      const container = containerRootRef.current
      const target = container ? findSelectionOption(container, selectedKeyRef.current) : null
      if (!root || !container || !target || target.offsetWidth <= 0 || target.offsetHeight <= 0) {
        container?.removeAttribute('data-selection-motion-ready')
        return false
      }
      controller.targetChanged(
        root,
        {
          height: target.offsetHeight,
          width: target.offsetWidth,
          x: target.offsetLeft,
          y: target.offsetTop
        },
        { reducedMotion: reducedMotionRef.current || settleImmediately }
      )
      container.setAttribute('data-selection-motion-ready', 'true')
      return true
    },
    [controller]
  )

  const cancelScheduledProjection = useCallback((): void => {
    if (projectionFrameRef.current === null) return
    window.cancelAnimationFrame(projectionFrameRef.current)
    projectionFrameRef.current = null
  }, [])

  const scheduleProjection = useCallback((): void => {
    cancelScheduledProjection()
    projectionFrameRef.current = window.requestAnimationFrame(() => {
      projectionFrameRef.current = null
      project(true)
    })
  }, [cancelScheduledProjection, project])

  useLayoutEffect(() => {
    if (!project(false)) scheduleProjection()
  }, [project, reducedMotion, scheduleProjection, selectedKey])

  useEffect(() => {
    const projectResize = (): void => {
      project(true)
    }
    window.addEventListener('resize', projectResize)
    return () => window.removeEventListener('resize', projectResize)
  }, [project])

  useEffect(
    () => () => {
      cancelScheduledProjection()
      controller.dispose()
    },
    [cancelScheduledProjection, controller]
  )

  const containerRef = useCallback<ElementRefCallback>(
    (element) => {
      containerRootRef.current?.removeAttribute('data-selection-motion-ready')
      containerRootRef.current = element
      if (element && !project(true)) scheduleProjection()
    },
    [project, scheduleProjection]
  )
  const indicatorRef = useCallback<ElementRefCallback>(
    (element) => {
      indicatorRootRef.current = element
      if (element) {
        if (!project(true)) scheduleProjection()
        return
      }
      containerRootRef.current?.removeAttribute('data-selection-motion-ready')
      controller.targetChanged(null, emptyTarget, { reducedMotion: true })
    },
    [controller, project, scheduleProjection]
  )

  return [containerRef, indicatorRef]
}

export function useSelectionFeedbackMotion(selected: boolean): ElementRefCallback {
  const rootRef = useRef<HTMLElement | null>(null)
  const selectedRef = useRef(selected)
  const reducedMotionRef = useRef(false)
  const hasProjectedRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()
  const controller = useMemo(() => createSelectionFeedbackMotionController(), [])
  selectedRef.current = selected
  reducedMotionRef.current = reducedMotion

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    controller.selectionChanged(root, selected, {
      reducedMotion: reducedMotion || !hasProjectedRef.current
    })
    hasProjectedRef.current = true
  }, [controller, reducedMotion, selected])

  useEffect(() => () => controller.dispose(), [controller])

  return useCallback<ElementRefCallback>(
    (element) => {
      rootRef.current = element
      if (element) return
      hasProjectedRef.current = false
      controller.selectionChanged(null, selectedRef.current, {
        reducedMotion: reducedMotionRef.current
      })
    },
    [controller]
  )
}

function findSelectionOption(container: HTMLElement, key: string): HTMLElement | null {
  for (const child of container.children) {
    if (child instanceof HTMLElement && child.dataset.selectionMotionOption === key) return child
  }
  return null
}
