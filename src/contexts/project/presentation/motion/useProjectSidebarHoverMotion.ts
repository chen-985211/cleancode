import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type RefObject
} from 'react'

import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import { createSelectionIndicatorMotionController } from '../../../../presentation/shared/motion/selectionMotion'

const rowSelector = '.project-card__header, .workspace-row'

export function useProjectSidebarHoverMotion(
  listRef: RefObject<HTMLDivElement | null>,
  disabled: boolean
) {
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  // These rows share a right edge. Project x as a left inset so the indent and
  // width follow one spring; a compositor translation would move the right edge.
  const controller = useMemo(
    () => createSelectionIndicatorMotionController({ animationDriver: { animate: () => null } }),
    []
  )
  const reducedMotion = usePrefersReducedMotion()

  const hide = useCallback(() => {
    targetRef.current = null
    listRef.current?.removeAttribute('data-sidebar-hover-visible')
  }, [listRef])

  const project = useCallback(
    (immediate = false) => {
      const list = listRef.current
      const indicator = indicatorRef.current
      const target = targetRef.current
      if (!list || !indicator || !target) return
      if (!list.contains(target) || target.closest('[inert]') || disabled) {
        hide()
        return
      }
      const bounds = target.getBoundingClientRect()
      const container = list.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      const wasVisible = list.hasAttribute('data-sidebar-hover-visible')
      const x = bounds.left - container.left + list.scrollLeft - list.clientLeft
      indicator.style.setProperty(
        '--cc-sidebar-hover-right',
        `${list.clientWidth - x - bounds.width}px`
      )
      controller.targetChanged(
        indicator,
        {
          x,
          y: bounds.top - container.top + list.scrollTop - list.clientTop,
          width: bounds.width,
          height: bounds.height
        },
        { reducedMotion: reducedMotion || immediate || !wasVisible }
      )
      list.setAttribute('data-sidebar-hover-visible', 'true')
    },
    [controller, disabled, hide, listRef, reducedMotion]
  )

  useLayoutEffect(() => {
    if (disabled) hide()
    else project()
  }, [disabled, hide, project])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const update = () => project(true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    const observeCards = () => {
      observer?.disconnect()
      observer?.observe(list)
      list.querySelectorAll('.project-card').forEach((card) => observer?.observe(card))
      update()
    }
    observeCards()
    const mutations = new MutationObserver(observeCards)
    mutations.observe(list, { childList: true, subtree: true })
    list.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      mutations.disconnect()
      list.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      controller.dispose()
    }
  }, [controller, listRef, project])

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.buttons > 0 || disabled) {
      hide()
      return
    }
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(rowSelector) : null
    if (!target) {
      // Keep the handoff continuous through the small gaps between navigation rows.
      const previous = targetRef.current?.getBoundingClientRect()
      if (previous && event.clientY >= previous.top - 16 && event.clientY <= previous.bottom + 16) {
        return
      }
      hide()
      return
    }
    targetRef.current = target
    project()
  }

  return { indicatorRef, onPointerMove, onPointerLeave: hide }
}
