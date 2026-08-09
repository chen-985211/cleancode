import {
  WindowsConptyWarmup,
  windowsConptyWarmupTimeoutMs,
  type WindowsConptyWarmupProcess,
  type WindowsConptyWarmupSpawn
} from '../../../../src/contexts/run/infrastructure/pty/WindowsConptyWarmup'

const powerShellExecutable = 'resolved-powershell-executable'
const warmupEnvironment = { TERM: 'xterm-256color' }
const workingDirectory = 'C:\\Users\\clean-code'

describe('Windows ConPTY warmup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each<NodeJS.Platform>(['darwin', 'linux'])(
    'does not spawn on %s through either entrypoint',
    async (runtimePlatform) => {
      const scheduled = createWarmup({ runtimePlatform })
      const started = createWarmup({ runtimePlatform })

      scheduled.warmup.schedule()
      scheduled.warmup.schedule()
      started.warmup.start()
      started.warmup.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(scheduled.resolvePowerShellExecutable).not.toHaveBeenCalled()
      expect(scheduled.spawnPty).not.toHaveBeenCalled()
      expect(started.resolvePowerShellExecutable).not.toHaveBeenCalled()
      expect(started.spawnPty).not.toHaveBeenCalled()
    }
  )

  it('schedules one short-lived PowerShell helper with the production ConPTY options', async () => {
    const { process, resolvePowerShellExecutable, spawnPty, warmup } = createWarmup()

    warmup.schedule()
    warmup.schedule()
    expect(spawnPty).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(0)
    await settleWarmupStart()
    warmup.start()
    warmup.schedule()

    expect(resolvePowerShellExecutable).toHaveBeenCalledTimes(1)
    expect(spawnPty).toHaveBeenCalledTimes(1)
    expect(spawnPty).toHaveBeenCalledWith(
      powerShellExecutable,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'exit'],
      {
        cols: 2,
        cwd: workingDirectory,
        env: warmupEnvironment,
        name: 'xterm-256color',
        rows: 1,
        useConpty: true,
        useConptyDll: true
      }
    )
    expect(process.onExit).toHaveBeenCalledOnce()
  })

  it('starts immediately at most once when start wins a pending schedule', async () => {
    const { spawnPty, warmup } = createWarmup()

    warmup.schedule()
    warmup.start()
    warmup.start()
    await settleWarmupStart()
    await vi.advanceTimersByTimeAsync(0)

    expect(spawnPty).toHaveBeenCalledTimes(1)
  })

  it('fails open when spawning the helper throws', async () => {
    const spawnPty = vi.fn<WindowsConptyWarmupSpawn>(() => {
      throw new Error('native warmup unavailable')
    })
    const warmup = new WindowsConptyWarmup({
      resolvePowerShellExecutable: vi.fn(async () => powerShellExecutable),
      runtimePlatform: 'win32',
      spawnPty
    })

    warmup.schedule()
    await vi.advanceTimersByTimeAsync(0)
    warmup.start()
    warmup.schedule()

    expect(spawnPty).toHaveBeenCalledTimes(1)
  })

  it('reports executable resolution failure without spawning or leaking a timer', async () => {
    const failure = new Error('PowerShell resolution unavailable')
    const onFailure = vi.fn()
    const spawnPty = vi.fn<WindowsConptyWarmupSpawn>()
    const warmup = new WindowsConptyWarmup({
      onFailure,
      resolvePowerShellExecutable: vi.fn(async () => Promise.reject(failure)),
      runtimePlatform: 'win32',
      spawnPty
    })

    warmup.start()
    await settleWarmupStart()
    await settleWarmupStart()

    expect(onFailure).toHaveBeenCalledWith('resolve', failure)
    expect(spawnPty).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('kills a helper when exit listener registration fails', async () => {
    const failure = new Error('exit listener unavailable')
    const onFailure = vi.fn()
    const process: WindowsConptyWarmupProcess = {
      kill: vi.fn(),
      onExit: vi.fn(() => {
        throw failure
      })
    }
    const warmup = new WindowsConptyWarmup({
      onFailure,
      resolvePowerShellExecutable: vi.fn(async () => powerShellExecutable),
      runtimePlatform: 'win32',
      spawnPty: vi.fn(() => process)
    })

    warmup.start()
    await settleWarmupStart()

    expect(onFailure).toHaveBeenCalledWith('spawn', failure)
    expect(process.kill).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('lets natural exit clean the listener and deadline without killing', async () => {
    const { process, warmup } = createWarmup()
    warmup.start()
    await settleWarmupStart()

    process.emitExit()
    await vi.advanceTimersByTimeAsync(windowsConptyWarmupTimeoutMs)
    warmup.dispose()

    expect(process.disposeExitListener).toHaveBeenCalledTimes(1)
    expect(process.kill).not.toHaveBeenCalled()
  })

  it('kills at most once when the deadline wins shutdown and a late exit', async () => {
    const { process, warmup } = createWarmup()
    warmup.start()
    await settleWarmupStart()

    await vi.advanceTimersByTimeAsync(windowsConptyWarmupTimeoutMs - 1)
    expect(process.kill).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    warmup.dispose()
    process.emitLateExit()

    expect(process.disposeExitListener).toHaveBeenCalledTimes(1)
    expect(process.kill).toHaveBeenCalledTimes(1)
  })

  it('cancels scheduled work on shutdown without spawning', async () => {
    const { resolvePowerShellExecutable, spawnPty, warmup } = createWarmup()

    warmup.schedule()
    warmup.dispose()
    warmup.dispose()
    await vi.runAllTimersAsync()

    expect(resolvePowerShellExecutable).not.toHaveBeenCalled()
    expect(spawnPty).not.toHaveBeenCalled()
  })

  it('does not spawn when shutdown wins executable resolution', async () => {
    let resolveExecutable: ((value: string) => void) | undefined
    const resolvePowerShellExecutable = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveExecutable = resolve
        })
    )
    const process = createFakeWarmupProcess()
    const spawnPty = vi.fn<WindowsConptyWarmupSpawn>(() => process)
    const warmup = new WindowsConptyWarmup({
      resolvePowerShellExecutable,
      runtimePlatform: 'win32',
      spawnPty
    })

    warmup.start()
    expect(resolvePowerShellExecutable).toHaveBeenCalledOnce()
    warmup.dispose()
    resolveExecutable?.(powerShellExecutable)
    await settleWarmupStart()

    expect(spawnPty).not.toHaveBeenCalled()
    expect(process.kill).not.toHaveBeenCalled()
  })

  it('kills a running helper only once when shutdown wins timeout and a late exit', async () => {
    const { process, warmup } = createWarmup()
    warmup.start()
    await settleWarmupStart()

    warmup.dispose()
    warmup.dispose()
    process.emitLateExit()
    await vi.advanceTimersByTimeAsync(windowsConptyWarmupTimeoutMs)

    expect(process.disposeExitListener).toHaveBeenCalledTimes(1)
    expect(process.kill).toHaveBeenCalledTimes(1)
  })

  it('handles an exit emitted synchronously while registering the listener', async () => {
    const disposeExitListener = vi.fn()
    const process: WindowsConptyWarmupProcess = {
      kill: vi.fn(),
      onExit: vi.fn((listener) => {
        listener({ exitCode: 0 })
        return { dispose: disposeExitListener }
      })
    }
    const spawnPty = vi.fn<WindowsConptyWarmupSpawn>(() => process)
    const warmup = new WindowsConptyWarmup({
      resolvePowerShellExecutable: vi.fn(async () => powerShellExecutable),
      runtimePlatform: 'win32',
      spawnPty
    })

    warmup.start()
    await settleWarmupStart()
    warmup.dispose()

    expect(disposeExitListener).toHaveBeenCalledTimes(1)
    expect(process.kill).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

function createWarmup(options?: { readonly runtimePlatform?: NodeJS.Platform }): {
  readonly process: FakeWarmupProcess
  readonly resolvePowerShellExecutable: ReturnType<typeof vi.fn<() => Promise<string>>>
  readonly spawnPty: ReturnType<typeof vi.fn<WindowsConptyWarmupSpawn>>
  readonly warmup: WindowsConptyWarmup
} {
  const process = createFakeWarmupProcess()
  const resolvePowerShellExecutable = vi.fn(async () => powerShellExecutable)
  const spawnPty = vi.fn<WindowsConptyWarmupSpawn>(() => process)
  const warmup = new WindowsConptyWarmup({
    environment: warmupEnvironment,
    resolvePowerShellExecutable,
    runtimePlatform: options?.runtimePlatform ?? 'win32',
    spawnPty,
    workingDirectory
  })
  return { process, resolvePowerShellExecutable, spawnPty, warmup }
}

async function settleWarmupStart(): Promise<void> {
  await Promise.resolve()
}

interface FakeWarmupProcess extends WindowsConptyWarmupProcess {
  readonly disposeExitListener: ReturnType<typeof vi.fn<() => void>>
  readonly kill: ReturnType<typeof vi.fn<WindowsConptyWarmupProcess['kill']>>
  readonly onExit: ReturnType<typeof vi.fn<WindowsConptyWarmupProcess['onExit']>>
  emitExit(): void
  emitLateExit(): void
}

function createFakeWarmupProcess(): FakeWarmupProcess {
  let activeExitListener: Parameters<WindowsConptyWarmupProcess['onExit']>[0] | undefined
  let lastExitListener: Parameters<WindowsConptyWarmupProcess['onExit']>[0] | undefined
  const disposeExitListener = vi.fn(() => {
    activeExitListener = undefined
  })

  return {
    disposeExitListener,
    emitExit: () => activeExitListener?.({ exitCode: 0 }),
    emitLateExit: () => lastExitListener?.({ exitCode: 0 }),
    kill: vi.fn<WindowsConptyWarmupProcess['kill']>(),
    onExit: vi.fn((listener) => {
      activeExitListener = listener
      lastExitListener = listener
      return { dispose: disposeExitListener }
    })
  }
}
