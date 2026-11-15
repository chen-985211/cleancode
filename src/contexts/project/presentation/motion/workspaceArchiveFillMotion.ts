import {
  advanceSpringAxis,
  isSpringAxisSettled,
  type SpringAxis
} from '../../../../presentation/shared/motion/motionSpring'

interface ArchiveFillIntent {
  readonly pending: boolean
  readonly present: boolean
  readonly reducedMotion: boolean
  readonly onFilled: () => void
}

// This is a waiting cue, not measured work: reserve the last tenth for success.
const waitingLimit = 0.9
const waitingResponseSeconds = 2.2
const completionDynamics = { dampingRatio: 1, response: 0.18 }
const completionThresholds = { value: 0.002, speed: 0.08 }

export function createWorkspaceArchiveFillMotion() {
  let root: HTMLElement | null = null
  let axis: SpringAxis = { value: 0, velocity: 0 }
  let frame: number | null = null
  let lastTimestamp = 0
  let phase: 'idle' | 'pending' | 'completing' | 'complete' = 'idle'
  let wasPending = false
  let onFilled = (): void => undefined

  const paint = (): void => {
    root?.style.setProperty('--workspace-archive-fill', `${axis.value}`)
    root?.setAttribute('data-workspace-fill-motion', phase)
  }

  const cancel = (): void => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  }

  const complete = (): void => {
    cancel()
    axis = { value: 1, velocity: 0 }
    phase = 'complete'
    paint()
    onFilled()
  }

  const schedule = (): void => {
    if (frame !== null) return
    lastTimestamp = window.performance.now()
    frame = window.requestAnimationFrame(advance)
  }

  function advance(timestamp: number): void {
    frame = null
    const elapsed = Math.max(0, (timestamp - lastTimestamp) / 1000)
    if (phase === 'pending') {
      const gap = Math.max(0, waitingLimit - axis.value)
      const remaining = gap * Math.exp(-elapsed / waitingResponseSeconds)
      axis = {
        value: remaining < 0.0001 ? Math.max(axis.value, waitingLimit) : waitingLimit - remaining,
        velocity: remaining / waitingResponseSeconds
      }
    } else if (phase === 'completing') {
      axis = advanceSpringAxis(axis, 1, completionDynamics, elapsed)
      if (isSpringAxisSettled(axis, 1, completionThresholds)) {
        complete()
        return
      }
    }
    paint()
    if (phase === 'completing' || (phase === 'pending' && axis.value < waitingLimit)) schedule()
  }

  return {
    intentChanged: (element: HTMLElement | null, intent: ArchiveFillIntent): void => {
      if (root !== element) {
        cancel()
        root = element
        axis = { value: 0, velocity: 0 }
        phase = 'idle'
        wasPending = false
      }
      onFilled = intent.onFilled
      if (!intent.present) {
        if (!root || intent.reducedMotion || !wasPending || axis.value === 1) complete()
        else {
          phase = 'completing'
          paint()
          schedule()
        }
        return
      }
      if (!intent.pending) {
        cancel()
        wasPending = false
        phase = 'idle'
        return
      }
      wasPending = true
      phase = 'pending'
      if (intent.reducedMotion) {
        cancel()
        axis = { value: waitingLimit, velocity: 0 }
      }
      paint()
      if (!intent.reducedMotion && axis.value < waitingLimit) schedule()
    },
    dispose: (): void => {
      cancel()
      root = null
      onFilled = (): void => undefined
    }
  }
}
