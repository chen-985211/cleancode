import type * as FileSystem from 'node:fs/promises'
import { join } from 'node:path'

const { readTextFile } = vi.hoisted(() => ({ readTextFile: vi.fn() }))

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof FileSystem>()),
  readFile: readTextFile
}))
vi.mock('playwright', () => ({ _electron: {} }))

import { waitForTextFile } from '../../support/e2eWorkbench'

describe('E2E text file readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    readTextFile.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for complete content to stop changing before returning it', async () => {
    readTextFile.mockResolvedValue('partial')
    const settled = vi.fn()
    const result = waitForTextFile(join('fixture', 'report.txt'), {
      intervalMs: 10,
      isComplete: (contents) => contents.startsWith('complete'),
      timeoutMs: 500
    })
    void result.then(settled, settled)

    await vi.advanceTimersByTimeAsync(100)
    expect(settled).not.toHaveBeenCalled()

    readTextFile.mockResolvedValue('complete-v1')
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).not.toHaveBeenCalled()

    readTextFile.mockResolvedValue('complete-v2')
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10)
    await expect(result).resolves.toBe('complete-v2')
  })

  it('retains the last transient file error when a report never appears', async () => {
    readTextFile.mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }))
    const result = expect(
      waitForTextFile(join('fixture', 'missing.txt'), { intervalMs: 5, timeoutMs: 20 })
    ).rejects.toMatchObject({ cause: { code: 'ENOENT' } })

    await vi.advanceTimersByTimeAsync(20)
    await result
  })
})
