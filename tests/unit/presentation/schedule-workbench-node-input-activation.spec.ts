import { scheduleWorkbenchNodeInputActivation } from '../../../src/presentation/app-shell/scheduleWorkbenchNodeInputActivation'

describe('schedule workbench node input activation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries after the viewport transition until the projected input becomes available', () => {
    let isAvailable = false
    const activate = vi.fn(() => isAvailable)

    scheduleWorkbenchNodeInputActivation({
      activate,
      transitionDuration: 220
    })

    vi.advanceTimersByTime(240)
    expect(activate).toHaveBeenCalledOnce()

    isAvailable = true
    vi.advanceTimersByTime(50)
    expect(activate).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(2_000)
    expect(activate).toHaveBeenCalledTimes(2)
  })

  it('stops retrying when a newer focus request cancels the pending activation', () => {
    const activate = vi.fn(() => false)
    const cancel = scheduleWorkbenchNodeInputActivation({
      activate,
      transitionDuration: 0
    })

    vi.advanceTimersByTime(20)
    cancel()
    vi.advanceTimersByTime(2_000)

    expect(activate).toHaveBeenCalledOnce()
  })
})
