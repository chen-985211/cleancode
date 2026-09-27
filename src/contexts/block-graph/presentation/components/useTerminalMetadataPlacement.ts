import { useLayoutEffect, type RefObject } from 'react'

import {
  resolveTerminalMetadataPlacement,
  type TerminalMetadataRect
} from '../view-models/terminalMetadataPlacement'

export interface TerminalMetadataPlacementEnvironment {
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly readViewport: () => TerminalMetadataRect | null
  readonly readViewportObstructions?: () => readonly HTMLElement[]
}

export function useTerminalMetadataPlacement(
  open: boolean,
  positionerRef: RefObject<HTMLDivElement | null>,
  environment: TerminalMetadataPlacementEnvironment | undefined
): void {
  useLayoutEffect(() => {
    const positioner = positionerRef.current
    const anchor = environment?.anchorRef.current
    if (!open || !positioner || !anchor || !environment) return

    let frame: number | null = null
    const place = () => {
      frame = null
      const parent = positioner.offsetParent
      const viewport = environment.readViewport()
      const surface = positioner.firstElementChild
      if (!(parent instanceof HTMLElement) || !(surface instanceof HTMLElement) || !viewport) return
      const parentBounds = parent.getBoundingClientRect()
      const anchorBounds = anchor.getBoundingClientRect()
      const width = positioner.offsetWidth
      const height = positioner.offsetHeight
      const zoom = parentBounds.width / parent.offsetWidth
      if (!width || !height || !Number.isFinite(zoom) || zoom <= 0) return
      const desired = {
        x: parentBounds.left + (parent.clientLeft + positioner.offsetLeft) * zoom,
        y: parentBounds.top + (parent.clientTop + positioner.offsetTop) * zoom
      }
      const placement = resolveTerminalMetadataPlacement({
        viewport,
        anchor: {
          x: anchorBounds.left,
          y: anchorBounds.top,
          width: anchorBounds.width,
          height: anchorBounds.height
        },
        desired,
        size: { width, height },
        zoom
      })
      positioner.style.transform = `translate(${(placement.x - desired.x) / zoom}px, ${(placement.y - desired.y) / zoom}px) scale(${placement.scale})`
      const fittedZoom = zoom * placement.scale
      const originX = (anchorBounds.left + anchorBounds.width / 2 - placement.x) / fittedZoom
      const originY = (anchorBounds.top + anchorBounds.height / 2 - placement.y) / fittedZoom
      surface.style.setProperty('--cc-anchored-surface-origin', `${originX}px ${originY}px`)
      surface.style.setProperty(
        '--cc-anchored-surface-offset-y',
        originY > height / 2 ? '12px' : '-12px'
      )
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(place)
    }
    // Observe external geometry dependencies, never our own presentation writes.
    const ancestors: HTMLElement[] = []
    for (let element: HTMLElement | null = anchor; element; element = element.parentElement) {
      ancestors.push(element)
    }
    const geometryElements = new Set([
      ...ancestors,
      ...(environment.readViewportObstructions?.() ?? [])
    ])
    const mutations = new MutationObserver(schedule)
    for (const element of geometryElements)
      mutations.observe(element, { attributes: true, attributeFilter: ['style', 'class'] })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    for (const element of [positioner, ...geometryElements]) resize?.observe(element)
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    place()
    return () => {
      mutations.disconnect()
      resize?.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      if (frame !== null) cancelAnimationFrame(frame)
      // Freeze placement during exit so reversal keeps the same live surface.
    }
  }, [environment, open, positionerRef])
}
