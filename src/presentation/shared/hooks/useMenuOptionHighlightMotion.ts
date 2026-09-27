import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEventHandler,
  type PointerEventHandler,
  type RefObject
} from 'react'
import {
  createMenuOptionHighlightMotionController,
  type MenuOptionHighlightMotionController
} from '../motion/menuOptionHighlightMotion'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const optionSelector = '[data-menu-option-highlight]:not(:disabled)'

interface MenuOptionHighlightInteractionProps {
  readonly onBlurCapture: FocusEventHandler<HTMLElement>
  readonly onFocusCapture: FocusEventHandler<HTMLElement>
  readonly onPointerLeave: PointerEventHandler<HTMLElement>
  readonly onPointerOver: PointerEventHandler<HTMLElement>
}

interface UseMenuOptionHighlightMotionResult {
  readonly highlightRef: RefObject<HTMLSpanElement | null>
  readonly interactionProps: MenuOptionHighlightInteractionProps
}

const resolveOption = (
  eventTarget: EventTarget | null,
  container: HTMLElement
): HTMLElement | null => {
  if (!(eventTarget instanceof Element)) {
    return null
  }
  const option = eventTarget.closest<HTMLElement>(optionSelector)
  return option && container.contains(option) ? option : null
}

export function useMenuOptionHighlightMotion(): UseMenuOptionHighlightMotionResult {
  const highlightRef = useRef<HTMLSpanElement>(null)
  const controllerRef = useRef<MenuOptionHighlightMotionController | null>(null)
  const hoveredOption = useRef<HTMLElement | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const ensureController = useCallback((): MenuOptionHighlightMotionController | null => {
    const highlight = highlightRef.current
    if (!highlight) {
      return null
    }
    controllerRef.current ??= createMenuOptionHighlightMotionController()
    controllerRef.current.setReducedMotion(reducedMotion)
    return controllerRef.current
  }, [reducedMotion])

  const activateOption = useCallback(
    (option: HTMLElement | null) => {
      if (!option) {
        const highlight = highlightRef.current
        if (highlight) ensureController()?.hide(highlight)
        return
      }
      const highlight = highlightRef.current
      if (!highlight) return
      // Group wrappers may establish their own offset parent; highlight coordinates belong to the menu.
      let top = option.offsetTop
      let parent = option.offsetParent as HTMLElement | null
      while (parent && parent !== highlight.offsetParent) {
        top += parent.offsetTop
        parent = parent.offsetParent as HTMLElement | null
      }
      ensureController()?.moveTo(highlight, { height: option.offsetHeight, top })
    },
    [ensureController]
  )

  useLayoutEffect(() => {
    ensureController()?.setReducedMotion(reducedMotion)
  }, [ensureController, reducedMotion])

  useEffect(
    () => () => {
      controllerRef.current?.dispose()
      controllerRef.current = null
    },
    []
  )

  const interactionProps = useMemo<MenuOptionHighlightInteractionProps>(
    () => ({
      onBlurCapture: (event) => {
        activateOption(
          resolveOption(event.relatedTarget, event.currentTarget) ?? hoveredOption.current
        )
      },
      onFocusCapture: (event) => {
        if (event.target === event.currentTarget) hoveredOption.current = null
        activateOption(resolveOption(event.target, event.currentTarget))
      },
      onPointerOver: (event) => {
        hoveredOption.current = resolveOption(event.target, event.currentTarget)
        activateOption(
          hoveredOption.current ??
            resolveOption(event.currentTarget.ownerDocument.activeElement, event.currentTarget)
        )
      },
      onPointerLeave: (event) => {
        hoveredOption.current = null
        const activeElement = event.currentTarget.ownerDocument.activeElement
        activateOption(resolveOption(activeElement, event.currentTarget))
      }
    }),
    [activateOption]
  )

  return { highlightRef, interactionProps }
}
