import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type RefObject
} from 'react'

import {
  createSpringProgressMotionController,
  type SpringProgressMotionRoot
} from '../shared/motion/springProgressMotion'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'

const scaleProperty = '--toolbar-utility-motion-scale'
const translationProperty = '--toolbar-utility-motion-y'
const stateAttribute = 'data-toolbar-utility-motion-state'

interface ToolbarUtilityButtonMotionProps {
  readonly onBlur: FocusEventHandler<HTMLButtonElement>
  readonly onKeyDown: KeyboardEventHandler<HTMLButtonElement>
  readonly onKeyUp: KeyboardEventHandler<HTMLButtonElement>
  readonly onPointerCancel: PointerEventHandler<HTMLButtonElement>
  readonly onPointerDown: PointerEventHandler<HTMLButtonElement>
  readonly onPointerLeave: PointerEventHandler<HTMLButtonElement>
  readonly onPointerUp: PointerEventHandler<HTMLButtonElement>
}

interface ToolbarUtilityButtonMotionOptions {
  readonly settleImmediately?: boolean
}

export function useToolbarUtilityButtonMotion(
  rootRef: RefObject<HTMLButtonElement | null>,
  options: ToolbarUtilityButtonMotionOptions = {}
): ToolbarUtilityButtonMotionProps {
  const reducedMotion = usePrefersReducedMotion()
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        clear: clearPresentation,
        dynamics: { dampingRatio: 1, response: 0.22 },
        stateAttribute
      }),
    []
  )

  useLayoutEffect(() => {
    controller.intentChanged(rootRef.current, {
      onSettled: emptyCallback,
      present: presentButton,
      reducedMotion: true,
      visible: true
    })
  }, [controller, options.settleImmediately, rootRef])

  useEffect(() => () => controller.dispose(), [controller])

  const press = useCallback<PointerEventHandler<HTMLButtonElement>>(
    (event) => {
      if (event.button !== 0 || event.currentTarget.disabled) return
      projectPressed(controller, event.currentTarget)
    },
    [controller]
  )
  const pressFromKeyboard = useCallback<KeyboardEventHandler<HTMLButtonElement>>(
    (event) => {
      if (event.repeat || event.currentTarget.disabled || !isActivationKey(event.key)) return
      projectPressed(controller, event.currentTarget)
    },
    [controller]
  )
  const release = useCallback(() => {
    controller.intentChanged(rootRef.current, {
      onSettled: emptyCallback,
      present: presentButton,
      reducedMotion: reducedMotion || options.settleImmediately === true,
      visible: true
    })
  }, [controller, options.settleImmediately, reducedMotion, rootRef])

  return {
    onBlur: release,
    onKeyDown: pressFromKeyboard,
    onKeyUp: release,
    onPointerCancel: release,
    onPointerDown: press,
    onPointerLeave: release,
    onPointerUp: release
  }
}

function projectPressed(
  controller: ReturnType<typeof createSpringProgressMotionController>,
  root: HTMLButtonElement
): void {
  controller.intentChanged(root, {
    onSettled: emptyCallback,
    present: presentButton,
    reducedMotion: true,
    visible: false
  })
}

function presentButton(root: SpringProgressMotionRoot, progress: number): void {
  root.style.setProperty(scaleProperty, `${round(0.9 + 0.1 * progress)}`)
  root.style.setProperty(translationProperty, `${round(0.8 * (1 - progress))}px`)
}

function clearPresentation(root: SpringProgressMotionRoot): void {
  root.style.removeProperty(scaleProperty)
  root.style.removeProperty(translationProperty)
}

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

function emptyCallback(): void {}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
