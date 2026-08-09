import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import {
  createSpringProgressMotionController,
  type SpringProgressMotionRoot
} from './springProgressMotion'

const opacityProperty = '--notification-icon-motion-opacity'
const translationProperty = '--notification-icon-motion-y'
const scaleProperty = '--notification-icon-motion-scale'
const stateAttribute = 'data-notification-icon-spring-state'

export function useNotificationStatusIconSpring(
  phase: 'current' | 'outgoing',
  reducedMotion: boolean,
  onExitComplete: () => void
) {
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        clear: clearPresentation,
        dynamics: { dampingRatio: 1, response: 0.26 },
        stateAttribute
      }),
    []
  )

  useLayoutEffect(() => {
    controller.intentChanged(rootRef.current, {
      onSettled: phase === 'outgoing' ? onExitComplete : emptyCallback,
      present: (root, progress) => presentIcon(root, progress, phase),
      reducedMotion,
      visible: phase === 'current'
    })
  }, [controller, onExitComplete, phase, reducedMotion])

  useEffect(() => () => controller.dispose(), [controller])

  return rootRef
}

function presentIcon(
  root: SpringProgressMotionRoot,
  progress: number,
  phase: 'current' | 'outgoing'
): void {
  const hiddenProgress = 1 - progress
  const translation = (phase === 'current' ? 6 : -6) * hiddenProgress
  const minimumScale = phase === 'current' ? 0.76 : 0.88
  root.style.setProperty(opacityProperty, `${round(progress)}`)
  root.style.setProperty(translationProperty, `${round(translation)}px`)
  root.style.setProperty(scaleProperty, `${round(minimumScale + (1 - minimumScale) * progress)}`)
}

function clearPresentation(root: SpringProgressMotionRoot): void {
  root.style.removeProperty(opacityProperty)
  root.style.removeProperty(translationProperty)
  root.style.removeProperty(scaleProperty)
}

function emptyCallback(): void {}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
