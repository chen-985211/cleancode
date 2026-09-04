import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

const processes = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }))
vi.mock('node:child_process', () => processes)

import { inspectCodexThreadResumability } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexThreadResumabilityInspector'

const threadId = '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!

describe('Codex query process lifecycle', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(process, 'platform', platformDescriptor)
  })

  it('terminates the Windows query tree only after the graceful EOF deadline', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.useFakeTimers()
    const child = createChild()
    processes.spawn.mockReturnValue(child)
    const query = inspect()
    child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n')
    child.stdout.write(JSON.stringify({ id: 2, result: { thread: { id: threadId } } }) + '\n')
    expect(processes.execFile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(processes.execFile).toHaveBeenCalledWith(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      expect.objectContaining({ timeout: 1_500, windowsHide: true }),
      expect.any(Function)
    )
    expect(child.kill).not.toHaveBeenCalled()
    child.emit('close', 1, null)
    expect(await query).toBe('available')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['available', 'missing'] as const)(
    'waits for process closure before returning %s',
    async (status) => {
      const child = createChild()
      processes.spawn.mockReturnValue(child)
      let returned = false
      const query = inspect().then((result) => {
        returned = true
        return result
      })
      child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n')
      child.stdout.write(
        JSON.stringify({
          id: 2,
          ...(status === 'available'
            ? { result: { thread: { id: threadId } } }
            : { error: { code: -32600, message: `thread not loaded: ${threadId}` } })
        }) + '\n'
      )
      await Promise.resolve()
      await Promise.resolve()
      const returnedBeforeClose = returned
      const killedBeforeClose = child.kill.mock.calls.length
      child.emit('close', 0, null)

      expect(await query).toBe(status)
      expect(returnedBeforeClose).toBe(false)
      expect(child.stdin.writableEnded).toBe(true)
      expect(killedBeforeClose).toBe(0)
    }
  )

  it('does not confirm absence when process cleanup never completes', async () => {
    vi.useFakeTimers()
    const child = createChild()
    processes.spawn.mockReturnValue(child)
    const query = inspect()
    child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n')
    child.stdout.write(
      JSON.stringify({
        id: 2,
        error: {
          code: -32600,
          message: `thread not loaded: ${threadId}`
        }
      }) + '\n'
    )
    await vi.runAllTimersAsync()
    expect(await query).toBe('unavailable')
  })
})

function inspect() {
  return inspectCodexThreadResumability({
    appServerArgs: [],
    environment: {},
    executable: 'codex',
    threadId,
    workspaceDirectory: '/workspace'
  })
}

function createChild() {
  return Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    pid: 1234,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true)
  })
}
