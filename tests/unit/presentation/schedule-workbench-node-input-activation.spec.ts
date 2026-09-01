import { scheduleWorkbenchNodeInputActivation } from '../../../src/presentation/app-shell/workbench/creation/scheduleWorkbenchNodeInputActivation'

describe('schedule workbench node input activation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the current viewport motion before retrying the projected input', async () => {
    let isAvailable = false
    let completeTransition: (completed: boolean) => void = () => undefined
    const activate = vi.fn(() => isAvailable)
    const transitionCompletion = new Promise<boolean>((resolve) => {
      completeTransition = resolve
    })

    scheduleWorkbenchNodeInputActivation({
      activate,
      transitionCompletion
    })

    vi.advanceTimersByTime(1_000)
    expect(activate).not.toHaveBeenCalled()

    completeTransition(true)
    await Promise.resolve()
    vi.advanceTimersByTime(20)
    expect(activate).toHaveBeenCalledOnce()

    isAvailable = true
    vi.advanceTimersByTime(50)
    expect(activate).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(100)
    expect(activate).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(2_000)
    expect(activate).toHaveBeenCalledTimes(3)
  })

  it('retries when the first projected input is replaced before focus stabilizes', async () => {
    const activationResults = [true, false, true, true]
    const activate = vi.fn(() => activationResults.shift() ?? true)

    scheduleWorkbenchNodeInputActivation({
      activate,
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)
    vi.advanceTimersByTime(100)
    vi.advanceTimersByTime(50)
    vi.advanceTimersByTime(100)

    expect(activate).toHaveBeenCalledTimes(4)
  })

  it('waits beyond the projection budget for the final terminal surface', async () => {
    let isReady = false
    let notifyReadiness: (status: 'invalid' | 'ready') => void = () => undefined
    const activate = vi.fn(() => true)
    const stopObserving = vi.fn()
    const observeReadiness = vi.fn((onChange: (status: 'invalid' | 'ready') => void) => {
      notifyReadiness = onChange
      return stopObserving
    })

    scheduleWorkbenchNodeInputActivation({
      activate,
      isReady: () => isReady,
      observeReadiness,
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)
    vi.advanceTimersByTime(10_000)
    expect(activate).not.toHaveBeenCalled()
    expect(observeReadiness).toHaveBeenCalledOnce()

    isReady = true
    notifyReadiness('ready')
    expect(activate).toHaveBeenCalledOnce()
    expect(stopObserving).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(100)
    expect(activate).toHaveBeenCalledTimes(2)
  })

  it('handles readiness that becomes available while observation is being installed', async () => {
    let isReady = false
    const activate = vi.fn(() => true)
    const stopObserving = vi.fn()

    scheduleWorkbenchNodeInputActivation({
      activate,
      isReady: () => isReady,
      observeReadiness: (onChange) => {
        isReady = true
        onChange('ready')
        return stopObserving
      },
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)

    expect(stopObserving).toHaveBeenCalledOnce()
    expect(activate).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(100)
    expect(activate).toHaveBeenCalledTimes(2)
  })

  it('restarts stability checks when the attached identity changes between activations', async () => {
    let isReady = true
    let notifyReadiness: (status: 'invalid' | 'ready') => void = () => undefined
    const activate = vi.fn(() => {
      if (activate.mock.calls.length === 1) isReady = false
      return true
    })

    scheduleWorkbenchNodeInputActivation({
      activate,
      isReady: () => isReady,
      observeReadiness: (onChange) => {
        notifyReadiness = onChange
        return () => undefined
      },
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)
    vi.advanceTimersByTime(100)
    expect(activate).toHaveBeenCalledOnce()

    isReady = true
    notifyReadiness('ready')
    expect(activate).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(100)
    expect(activate).toHaveBeenCalledTimes(3)
  })

  it('keeps navigation activation on the original bounded projection retry path', async () => {
    const activate = vi.fn(() => false)

    scheduleWorkbenchNodeInputActivation({
      activate,
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(10_000)
    const attemptsWithinProjectionBudget = activate.mock.calls.length

    expect(attemptsWithinProjectionBudget).toBeGreaterThan(1)
    vi.advanceTimersByTime(10_000)
    expect(activate).toHaveBeenCalledTimes(attemptsWithinProjectionBudget)
  })

  it('does not activate a stale target when its viewport motion is superseded', async () => {
    const activate = vi.fn(() => true)

    scheduleWorkbenchNodeInputActivation({
      activate,
      transitionCompletion: Promise.resolve(false)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(2_000)

    expect(activate).not.toHaveBeenCalled()
  })

  it('stops retrying when a newer focus request cancels the pending activation', async () => {
    const activate = vi.fn(() => false)
    const cancel = scheduleWorkbenchNodeInputActivation({
      activate,
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)
    cancel()
    vi.advanceTimersByTime(2_000)

    expect(activate).toHaveBeenCalledOnce()
  })

  it('disconnects a creation readiness observer when focus intent is cancelled', async () => {
    const activate = vi.fn(() => true)
    const stopObserving = vi.fn()
    let notifyReadiness: (status: 'invalid' | 'ready') => void = () => undefined
    const cancel = scheduleWorkbenchNodeInputActivation({
      activate,
      isReady: () => false,
      observeReadiness: (onChange) => {
        notifyReadiness = onChange
        return stopObserving
      },
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)
    cancel()
    notifyReadiness('ready')
    vi.advanceTimersByTime(10_000)

    expect(stopObserving).toHaveBeenCalledOnce()
    expect(activate).not.toHaveBeenCalled()
  })

  it('abandons a creation focus intent when readiness becomes invalid', async () => {
    let isReady = false
    let notifyReadiness: (status: 'invalid' | 'ready') => void = () => undefined
    const activate = vi.fn(() => true)
    const stopObserving = vi.fn()

    scheduleWorkbenchNodeInputActivation({
      activate,
      isReady: () => isReady,
      observeReadiness: (onChange) => {
        notifyReadiness = onChange
        return stopObserving
      },
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)
    notifyReadiness('invalid')

    isReady = true
    notifyReadiness('ready')
    vi.advanceTimersByTime(10_000)

    expect(stopObserving).toHaveBeenCalledOnce()
    expect(activate).not.toHaveBeenCalled()
  })

  it('abandons focus when the surface becomes invalid between stability activations', async () => {
    let isReady = true
    let notifyReadiness: (status: 'invalid' | 'ready') => void = () => undefined
    const activate = vi.fn(() => true)

    scheduleWorkbenchNodeInputActivation({
      activate,
      isReady: () => isReady,
      observeReadiness: (onChange) => {
        notifyReadiness = onChange
        return vi.fn()
      },
      transitionCompletion: Promise.resolve(true)
    })

    await Promise.resolve()
    vi.advanceTimersByTime(20)
    expect(activate).toHaveBeenCalledOnce()

    isReady = false
    vi.advanceTimersByTime(100)
    notifyReadiness('invalid')
    isReady = true
    notifyReadiness('ready')
    vi.advanceTimersByTime(10_000)

    expect(activate).toHaveBeenCalledOnce()
  })
})
