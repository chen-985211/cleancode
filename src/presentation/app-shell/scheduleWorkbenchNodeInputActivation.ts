interface ScheduleWorkbenchNodeInputActivationInput {
  readonly activate: () => boolean
  readonly transitionDuration: number
}

const inputProjectionRetryInterval = 50
const inputProjectionTimeout = 2_000
const postTransitionFocusDelay = 20

export function scheduleWorkbenchNodeInputActivation({
  activate,
  transitionDuration
}: ScheduleWorkbenchNodeInputActivationInput): () => void {
  let isPending = true
  let remainingRetryTime = inputProjectionTimeout
  let timeoutId = 0

  const tryActivation = (): void => {
    if (!isPending) {
      return
    }

    if (activate()) {
      isPending = false
      return
    }

    if (remainingRetryTime <= 0) {
      isPending = false
      return
    }

    remainingRetryTime -= inputProjectionRetryInterval
    timeoutId = window.setTimeout(tryActivation, inputProjectionRetryInterval)
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
