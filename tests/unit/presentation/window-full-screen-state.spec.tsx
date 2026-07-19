import { act, renderHook, waitFor } from '@testing-library/react'

import { createDeferred } from '../../fixtures/deferred'
import { useWindowFullScreenState } from '../../../src/presentation/app-shell/useWindowFullScreenState'

describe('window fullscreen state', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('uses the current native state when no newer transition has arrived', async () => {
    installFullScreenApi({ initialState: Promise.resolve(true) })

    const { result } = renderHook(() => useWindowFullScreenState())

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('does not let a stale initial query overwrite a newer native transition', async () => {
    const initialState = createDeferred<boolean>()
    const unsubscribe = vi.fn()
    let publishState: ((isFullScreen: boolean) => void) | undefined
    installFullScreenApi({
      initialState: initialState.promise,
      onSubscribe: (listener) => {
        publishState = listener
        return unsubscribe
      }
    })
    const { result, unmount } = renderHook(() => useWindowFullScreenState())

    act(() => publishState?.(true))
    expect(result.current).toBe(true)

    await act(async () => {
      initialState.resolve(false)
      await initialState.promise
    })
    expect(result.current).toBe(true)

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

function installFullScreenApi(input: {
  readonly initialState: Promise<boolean>
  readonly onSubscribe?: (listener: (isFullScreen: boolean) => void) => () => void
}): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: {
      appName: 'cleancode',
      getWindowFullScreenState: () => input.initialState,
      onWindowFullScreenStateChange: (listener: (isFullScreen: boolean) => void) =>
        input.onSubscribe?.(listener) ?? vi.fn()
    } as Window['cleancode']
  })
}
