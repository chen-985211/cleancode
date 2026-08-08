interface ScheduleWorkbenchNodeInputActivationInput {
  readonly activate: () => boolean
  readonly isReady?: () => boolean
  readonly observeReadiness?: (
    onChange: (status: WorkbenchNodeInputReadinessStatus) => void
  ) => () => void
  readonly transitionCompletion: Promise<boolean>
}

type WorkbenchNodeInputReadinessStatus = 'invalid' | 'ready'

const inputProjectionRetryInterval = 50
const inputProjectionStabilityInterval = 100
const inputProjectionTimeout = 2_000
const postTransitionFocusDelay = 20

export function scheduleWorkbenchNodeInputActivation({
  activate,
  isReady = () => true,
  observeReadiness,
  transitionCompletion
}: ScheduleWorkbenchNodeInputActivationInput): () => void {
  let isPending = true
  let remainingRetryTime = inputProjectionTimeout
  let stableActivationCount = 0
  let timeoutId: number | null = null
  let stopObservingReady: (() => void) | null = null

  const stopReadinessObservation = (): void => {
    stopObservingReady?.()
    stopObservingReady = null
  }

  const finish = (): void => {
    if (!isPending) {
      return
    }

    isPending = false
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
    stopReadinessObservation()
  }

  const scheduleRetry = (delay: number): void => {
    if (remainingRetryTime <= 0) {
      finish()
      return
    }

    const boundedDelay = Math.min(delay, remainingRetryTime)
    remainingRetryTime -= boundedDelay
    timeoutId = window.setTimeout(() => {
      timeoutId = null
      tryActivation()
    }, boundedDelay)
  }

  const waitForReadiness = (): void => {
    stableActivationCount = 0

    if (!observeReadiness) {
      scheduleRetry(inputProjectionRetryInterval)
      return
    }

    stopReadinessObservation()
    let observedStatus: WorkbenchNodeInputReadinessStatus | null = null
    let stopObservation: (() => void) | null = null
    const continueAfterObservation = (status: WorkbenchNodeInputReadinessStatus): void => {
      if (status === 'invalid') {
        finish()
        return
      }
      tryActivation()
    }
    const handleReadinessChange = (status: WorkbenchNodeInputReadinessStatus): void => {
      if (!isPending) {
        return
      }

      observedStatus = status
      if (!stopObservation) {
        return
      }

      if (stopObservingReady === stopObservation) {
        stopObservingReady = null
      }
      stopObservation()
      stopObservation = null
      continueAfterObservation(status)
    }

    stopObservation = observeReadiness(handleReadinessChange)
    if (observedStatus) {
      stopObservation()
      stopObservation = null
      continueAfterObservation(observedStatus)
      return
    }
    stopObservingReady = stopObservation
  }

  const tryActivation = (): void => {
    if (!isPending) {
      return
    }

    if (!isReady()) {
      waitForReadiness()
      return
    }

    if (activate()) {
      stableActivationCount += 1
      if (stableActivationCount >= 2) {
        finish()
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
        finish()
        return
      }
      scheduleRetry(postTransitionFocusDelay)
    },
    () => {
      finish()
    }
  )

  return finish
}
