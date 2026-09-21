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
      ensureController()?.moveTo(highlight, {
        height: option.offsetHeight,
        top: option.offsetTop
      })
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
      onFocusCapture: (event) => {
        activateOption(resolveOption(event.target, event.currentTarget))
      },
      onPointerOver: (event) => {
        activateOption(resolveOption(event.target, event.currentTarget))
      },
      onPointerLeave: (event) => {
        const activeElement = event.currentTarget.ownerDocument.activeElement
        activateOption(resolveOption(activeElement, event.currentTarget))
      }
    }),
    [activateOption]
  )

  return { highlightRef, interactionProps }
}
