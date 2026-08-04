import { scheduleWorkbenchNodeInputActivation } from '../../../src/presentation/app-shell/scheduleWorkbenchNodeInputActivation'

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
})
