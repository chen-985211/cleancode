import type { TerminalCollapsedFeedbackStatus } from './terminalCollapsedFeedback'

interface ProgressRoot {
  readonly style: Pick<CSSStyleDeclaration, 'transform'>
  readonly setAttribute: (name: string, value: string) => void
}

interface ProgressScheduler {
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
  readonly cancelFrame: (id: number) => void
}

interface ProgressIntent {
  readonly status: TerminalCollapsedFeedbackStatus
  readonly visible: boolean
  readonly reducedMotion: boolean
}

const runningLimit = 0.96
const runningResponseMs = 2400
const completionDurationMs = 180
const browserScheduler: ProgressScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id)
}

// This is presentation progress, never a command's completion percentage.
// One lifetime owns the curve; session metadata and disclosure never restart it.
export function createTerminalProgressMotion(scheduler: ProgressScheduler = browserScheduler) {
  let root: ProgressRoot | null = null
  let status: TerminalCollapsedFeedbackStatus | null = null
  let progress = 0
  let startedAt = 0
  let completingAt = 0
  let completingFrom = 0
  let completingVelocity = 0
  let visible = false
  let reduced = false
  let frame: number | null = null

  const cancelFrame = () => {
    if (frame !== null) scheduler.cancelFrame(frame)
    frame = null
  }

  const sample = (now: number) => {
    if (status === 'running') {
      progress = Math.max(
        progress,
        runningLimit * (1 - Math.exp(-Math.max(0, now - startedAt) / runningResponseMs))
      )
      if (runningLimit - progress < 0.0001) progress = runningLimit
    } else if (status === 'done' && progress < 1) {
      const elapsed = Math.min(1, Math.max(0, now - completingAt) / completionDurationMs)
      const inheritedTravel = completingVelocity * completionDurationMs
      progress =
        elapsed === 1
          ? 1
          : Math.max(
              progress,
              completingFrom +
                inheritedTravel * elapsed +
                (1 - completingFrom - inheritedTravel) * elapsed ** 2
            )
    }
  }

  const present = () => {
    if (!root) return
    root.style.transform = `scaleX(${progress})`
    root.setAttribute(
      'data-progress-phase',
      status === 'done' ? (progress === 1 ? 'complete' : 'completing') : 'active'
    )
  }

  const needsFrame = () =>
    root &&
    visible &&
    !reduced &&
    ((status === 'running' && progress < runningLimit) || (status === 'done' && progress < 1))

  const schedule = () => {
    if (frame !== null || !needsFrame()) return
    frame = scheduler.requestFrame((now) => {
      frame = null
      sample(now)
      present()
      schedule()
    })
  }

  return {
    update(nextRoot: ProgressRoot | null, intent: ProgressIntent) {
      const now = scheduler.now()
      sample(now)
      const previous = status
      root = nextRoot
      visible = intent.visible
      reduced = intent.reducedMotion
      if (intent.status !== previous) {
        status = intent.status
        if (status === 'running') {
          progress = 0
          startedAt = now
        } else if (status === 'done') {
          completingAt = now
          completingFrom = progress
          completingVelocity =
            previous === 'running' ? Math.max(0, runningLimit - progress) / runningResponseMs : 0
          if (previous !== 'running' || !visible) progress = 1
        } else if (status === 'idle') progress = 0
      }
      if (reduced) {
        if (status === 'running') progress = Math.max(progress, runningLimit)
        if (status === 'done') progress = 1
      }
      present()
      if (!needsFrame()) cancelFrame()
      else schedule()
    },
    dispose() {
      cancelFrame()
      root = null
    }
  }
}
