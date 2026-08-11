import { act, renderHook, waitFor } from '@testing-library/react'

import type { TerminalRuntimeAvailabilitySnapshot } from '../../../src/contexts/run/application/dto/TerminalRuntimeAvailability'
import type { AppNotificationController } from '../../../src/presentation/app-shell/appNotifications'
import { useTerminalRuntimeAvailability } from '../../../src/presentation/app-shell/useTerminalRuntimeAvailability'

describe('terminal runtime availability', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it('keeps one actionable failure notification and clears it after a successful retry', async () => {
    const unavailable = availability('unavailable', 0)
    const ready = availability('ready', 1)
    const notifications = createNotifications()
    const retryTerminalRuntime = vi.fn(async () => ready)
    let publishAvailability: ((snapshot: TerminalRuntimeAvailabilitySnapshot) => void) | undefined
    installRuntimeApi({
      current: Promise.resolve(unavailable),
      retryTerminalRuntime,
      subscribe: (listener) => {
        publishAvailability = listener
        return vi.fn()
      }
    })

    const { result } = renderHook(() => useTerminalRuntimeAvailability(notifications))

    await waitFor(() => expect(result.current).toEqual(unavailable))
    expect(notifications.notify).toHaveBeenCalledOnce()

    act(() => publishAvailability?.({ ...unavailable }))
    expect(notifications.notify).toHaveBeenCalledOnce()
    expect(notifications.update).toHaveBeenCalled()

    const notification = vi.mocked(notifications.notify).mock.calls[0]?.[0]
    expect(notification?.action?.icon).toBe('retry')
    await act(async () => notification?.action?.onClick())

    expect(retryTerminalRuntime).toHaveBeenCalledOnce()
    expect(result.current).toEqual(ready)
    expect(notifications.dismiss).toHaveBeenCalledWith('runtime-notification')
  })
})

function availability(
  phase: TerminalRuntimeAvailabilitySnapshot['phase'],
  epoch: number
): TerminalRuntimeAvailabilitySnapshot {
  return {
    phase,
    epoch,
    errorCode: phase === 'unavailable' ? 'TERMINAL_PROVIDER_UNAVAILABLE' : null,
    retryable: phase === 'unavailable'
  }
}

function createNotifications(): AppNotificationController {
  return {
    dismiss: vi.fn(),
    notify: vi.fn(() => 'runtime-notification'),
    update: vi.fn(() => true)
  }
}

function installRuntimeApi(input: {
  readonly current: Promise<TerminalRuntimeAvailabilitySnapshot>
  readonly retryTerminalRuntime: () => Promise<TerminalRuntimeAvailabilitySnapshot>
  readonly subscribe: (
    listener: (snapshot: TerminalRuntimeAvailabilitySnapshot) => void
  ) => () => void
}): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: {
      appName: 'cleancode',
      getTerminalRuntimeAvailability: () => input.current,
      onTerminalRuntimeAvailability: input.subscribe,
      retryTerminalRuntime: input.retryTerminalRuntime
    } as Window['cleancode']
  })
}
