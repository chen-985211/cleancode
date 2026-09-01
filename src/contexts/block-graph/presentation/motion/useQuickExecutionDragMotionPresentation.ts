import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type RefCallback
} from 'react'

import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import {
  advanceSpringAxis,
  isSpringAxisSettled,
  type SpringAxis
} from '../../../../presentation/shared/motion/motionSpring'
import type { QuickExecutionDragMotion } from '../view-models/quickExecutionDrag'

interface QuickExecutionDragMotionPresentation {
  readonly className: string
  readonly onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void
  readonly surfaceRef: RefCallback<HTMLElement>
  readonly style: CSSProperties | undefined
}

const positionDynamics = { dampingRatio: 1, response: 0.36 }
const deleteScaleDynamics = { dampingRatio: 1, response: 0.26 }
const settlementThresholds = { speed: 0.02, value: 0.002 }

export function useQuickExecutionDragMotionPresentation(
  motion: QuickExecutionDragMotion | undefined,
  onComplete: (motionId: string) => void
): QuickExecutionDragMotionPresentation {
  const [surface, setSurface] = useState<HTMLElement | null>(null)
  const onCompleteRef = useRef(onComplete)
  const reducedMotion = usePrefersReducedMotion()
  onCompleteRef.current = onComplete

  useLayoutEffect(() => {
    if (!surface || !motion) return undefined

    let frameId: number | null = null
    let previousTimestamp = window.performance.now()
    let xAxis: SpringAxis = { value: motion.offset.x, velocity: 0 }
    let yAxis: SpringAxis = { value: motion.offset.y, velocity: 0 }
    let scaleAxis: SpringAxis = { value: motion.scale?.from ?? 1, velocity: 0 }
    const scaleTarget = motion.scale?.to ?? 1

    const present = (): void => {
      surface.style.setProperty('--workbench-object-motion-x', `${round(xAxis.value)}px`)
      surface.style.setProperty('--workbench-object-motion-y', `${round(yAxis.value)}px`)
      surface.style.setProperty('--workbench-object-motion-opacity', '1')
      surface.style.setProperty('--workbench-object-motion-scale', `${round(scaleAxis.value)}`)
    }
    const complete = (): void => {
      onCompleteRef.current(motion.id)
    }

    if (reducedMotion) {
      xAxis = { value: 0, velocity: 0 }
      yAxis = { value: 0, velocity: 0 }
      scaleAxis = { value: scaleTarget, velocity: 0 }
      present()
      complete()
      return undefined
    }

    present()
    const advance = (timestamp: number): void => {
      frameId = null
      const elapsedSeconds = Math.max(0, (timestamp - previousTimestamp) / 1000)
      previousTimestamp = timestamp
      xAxis = advanceSpringAxis(xAxis, 0, positionDynamics, elapsedSeconds)
      yAxis = advanceSpringAxis(yAxis, 0, positionDynamics, elapsedSeconds)
      scaleAxis = advanceSpringAxis(scaleAxis, scaleTarget, deleteScaleDynamics, elapsedSeconds)
      present()

      if (
        isSpringAxisSettled(xAxis, 0, settlementThresholds) &&
        isSpringAxisSettled(yAxis, 0, settlementThresholds) &&
        isSpringAxisSettled(scaleAxis, scaleTarget, settlementThresholds)
      ) {
        complete()
        return
      }

      frameId = window.requestAnimationFrame(advance)
    }
    frameId = window.requestAnimationFrame(advance)

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [motion, reducedMotion, surface])

  const surfaceRef = useCallback<RefCallback<HTMLElement>>((nextSurface) => {
    setSurface(nextSurface)
  }, [])

  return {
    className: motion
      ? `workbench-object-motion--${motion.kind} workbench-object-motion--spatial`
      : '',
    onAnimationEnd: () => undefined,
    surfaceRef,
    style: undefined
  }
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000
}
