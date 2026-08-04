interface ScheduleWorkbenchNodeInputActivationInput {
  readonly activate: () => boolean
  readonly transitionCompletion: Promise<boolean>
}

const inputProjectionRetryInterval = 50
const inputProjectionStabilityInterval = 100
const inputProjectionTimeout = 2_000
const postTransitionFocusDelay = 20

export function scheduleWorkbenchNodeInputActivation({
  activate,
  transitionCompletion
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

  void transitionCompletion.then(
    (completed) => {
      if (!isPending) {
        return
      }
      if (!completed) {
        isPending = false
        return
      }
      scheduleRetry(postTransitionFocusDelay)
    },
    () => {
      isPending = false
    }
  )

  return () => {
    if (!isPending) {
      return
    }

    isPending = false
    window.clearTimeout(timeoutId)
  }
}
