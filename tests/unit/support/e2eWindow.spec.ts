import type { ElectronApplication } from 'playwright'
import { setElectronContentSize } from '../../support/e2eWindow'

describe('native Electron window sizing', () => {
  afterEach(() => vi.useRealTimers())

  it('accepts a lost evaluation response only when the native size was applied', async () => {
    const evaluate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockResolvedValue([2200, 1400])

    await setElectronContentSize({ evaluate } as unknown as ElectronApplication, {
      width: 2200,
      height: 1400
    })

    expect(evaluate).toHaveBeenCalledTimes(2)
    expect(evaluate.mock.calls[0]![1]).toEqual({ width: 2200, height: 1400 })
    expect(evaluate.mock.calls[1]).toHaveLength(1)
  })

  it('still fails if the native window never reaches the requested size', async () => {
    vi.useFakeTimers()
    const evaluate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockResolvedValue([1200, 900])
    const result = setElectronContentSize({ evaluate } as unknown as ElectronApplication, {
      width: 2200,
      height: 1400
    })
    const assertion = expect(result).rejects.toThrow('Electron content size 2200x1400')

    await Promise.all([assertion, vi.advanceTimersByTimeAsync(5000)])
    expect(evaluate.mock.calls.filter((call) => call.length === 2)).toHaveLength(1)
  })

  it('accepts the extra native frame extent reported by Windows', async () => {
    vi.useFakeTimers()
    const evaluate = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue([2216, 1439])
    const result = setElectronContentSize({ evaluate } as unknown as ElectronApplication, {
      width: 2200,
      height: 1400
    })

    await Promise.all([expect(result).resolves.toBeUndefined(), vi.advanceTimersByTimeAsync(5000)])
    expect(evaluate).toHaveBeenCalledTimes(2)
  })

  it('propagates other mutation errors without retrying or observing', async () => {
    const error = new Error('BrowserWindow is destroyed')
    const evaluate = vi.fn().mockRejectedValue(error)

    await expect(
      setElectronContentSize({ evaluate } as unknown as ElectronApplication, {
        width: 2200,
        height: 1400
      })
    ).rejects.toBe(error)
    expect(evaluate).toHaveBeenCalledOnce()
  })
})
