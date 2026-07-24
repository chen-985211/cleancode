interface ScheduleWorkbenchNodeInputActivationInput {
  readonly activate: () => boolean
  readonly transitionDuration: number
}

const inputProjectionRetryInterval = 50
const inputProjectionStabilityInterval = 100
const inputProjectionTimeout = 2_000
const postTransitionFocusDelay = 20

export function scheduleWorkbenchNodeInputActivation({
  activate,
  transitionDuration
}: ScheduleWorkbenchNodeInputActivationInput): () => void {
  let isPending = true
  let remainingRetryTime = inputProjectionTimeout
  let stableActivationCount = 0
  let timeoutId = 0

  const scheduleRetry = (delay: number): void => {
    if (remainingRetryTime <= 0) {
      isPending = false
      return
    }

    const boundedDelay = Math.min(delay, remainingRetryTime)
    remainingRetryTime -= boundedDelay
    timeoutId = window.setTimeout(tryActivation, boundedDelay)
  }

  const tryActivation = (): void => {
    if (!isPending) {
      return
    }

    if (activate()) {
      stableActivationCount += 1
      if (stableActivationCount >= 2) {
        isPending = false
        return
      }
      scheduleRetry(inputProjectionStabilityInterval)
      return
    }

    stableActivationCount = 0
    scheduleRetry(inputProjectionRetryInterval)
  }

  timeoutId = window.setTimeout(
    tryActivation,
    Math.max(0, transitionDuration) + postTransitionFocusDelay
  )

  return () => {
    if (!isPending) {
      return
    }

    isPending = false
    window.clearTimeout(timeoutId)
  }
}
