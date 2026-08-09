import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PersistentTerminalProviderClient,
  type PersistentTerminalProviderClientOptions
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClient'
import {
  createProviderEndpoint,
  runWithProviderLaunchLock,
  type ProviderLaunchLockLease,
  type TerminalProviderMetadata
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'

describe('PersistentTerminalProviderClient Provider launch', () => {
  let stateDirectory = ''

  beforeEach(async () => {
    stateDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-launch-'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(stateDirectory, { force: true, recursive: true })
  })

  it('uses a generation-specific endpoint for each Provider instance', () => {
    const first = createProviderEndpoint(stateDirectory, 'first-provider')
    const second = createProviderEndpoint(stateDirectory, 'second-provider')

    expect(first).not.toBe(second)
    expect(createProviderEndpoint(stateDirectory, 'first-provider')).toBe(first)
  })

  it('launches from the resolved runtime image and records its ownership key', async () => {
    const child = createSpawnedChild(4242)
    const spawnProcess = vi.fn(() => child) as NonNullable<
      PersistentTerminalProviderClientOptions['spawnProcess']
    >
    const resolveLaunchTarget = vi.fn(async () => ({
      executablePath: 'C:\\runtime\\cleancode-terminal-provider.exe',
      providerEntryPath: 'C:\\runtime\\resources\\app.asar\\out\\main\\provider.js',
      runtimeImageKey: '0.1.7-image-key'
    }))
    const client = new PersistentTerminalProviderClient({
      stateDirectory,
      providerEntryPath: 'C:\\installed\\provider.js',
      executablePath: 'C:\\installed\\CleanCode.exe',
      resolveLaunchTarget,
      spawnProcess
    })

    const metadata = await invokeLaunchProvider(client, join(stateDirectory, 'provider.json'))

    expect(resolveLaunchTarget).toHaveBeenCalledOnce()
    expect(spawnProcess).toHaveBeenCalledWith(
      'C:\\runtime\\cleancode-terminal-provider.exe',
      [
        'C:\\runtime\\resources\\app.asar\\out\\main\\provider.js',
        '--metadata',
        join(stateDirectory, 'provider.json'),
        '--instance-id',
        metadata.instanceId,
        '--heartbeat-id',
        metadata.liveness?.heartbeatId
      ],
      expect.objectContaining({
        cwd: stateDirectory,
        detached: true,
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' })
      })
    )
    expect(child.unref).toHaveBeenCalledOnce()
    expect(metadata).toMatchObject({ processId: 4242, runtimeImageKey: '0.1.7-image-key' })
    expect(metadata.liveness?.heartbeatId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(JSON.parse(await readFile(join(stateDirectory, 'provider.json'), 'utf8'))).toEqual(
      metadata
    )
  })

  it('keeps the installed launch target and omits image ownership without a resolver', async () => {
    const spawnProcess = vi.fn(() => createSpawnedChild(4243)) as NonNullable<
      PersistentTerminalProviderClientOptions['spawnProcess']
    >
    const client = new PersistentTerminalProviderClient({
      stateDirectory,
      providerEntryPath: '/installed/provider.js',
      executablePath: '/installed/electron',
      spawnProcess
    })

    const metadata = await invokeLaunchProvider(client, join(stateDirectory, 'provider.json'))

    expect(spawnProcess).toHaveBeenCalledWith(
      '/installed/electron',
      [
        '/installed/provider.js',
        '--metadata',
        join(stateDirectory, 'provider.json'),
        '--instance-id',
        metadata.instanceId,
        '--heartbeat-id',
        metadata.liveness?.heartbeatId
      ],
      expect.objectContaining({ cwd: stateDirectory })
    )
    expect(metadata).not.toHaveProperty('runtimeImageKey')
  })

  it('observes an asynchronous spawn error instead of leaking an unhandled child error', async () => {
    const failure = Object.assign(new Error('provider host missing'), { code: 'ENOENT' })
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      unref: vi.fn()
    }) as unknown as ChildProcess
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit('error', failure))
      return child
    }) as NonNullable<PersistentTerminalProviderClientOptions['spawnProcess']>
    const client = new PersistentTerminalProviderClient({
      stateDirectory,
      providerEntryPath: '/missing/provider.js',
      executablePath: '/missing/electron',
      spawnProcess
    })

    await expect(invokeLaunchProvider(client, join(stateDirectory, 'provider.json'))).rejects.toBe(
      failure
    )
    expect(child.unref).not.toHaveBeenCalled()
    await expect(readFile(join(stateDirectory, 'provider.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('falls back once to the installed host when the relocated image cannot spawn', async () => {
    const runtimeFailure = Object.assign(new Error('runtime image blocked'), { code: 'EACCES' })
    const failedChild = Object.assign(new EventEmitter(), {
      pid: undefined,
      unref: vi.fn()
    }) as unknown as ChildProcess
    const fallbackChild = createSpawnedChild(4244)
    const spawnProcessMock = vi
      .fn(() => {
        queueMicrotask(() => failedChild.emit('error', runtimeFailure))
        return failedChild
      })
      .mockImplementationOnce(() => {
        queueMicrotask(() => failedChild.emit('error', runtimeFailure))
        return failedChild
      })
      .mockImplementationOnce(() => fallbackChild)
    const spawnProcess = spawnProcessMock as NonNullable<
      PersistentTerminalProviderClientOptions['spawnProcess']
    >
    const client = new PersistentTerminalProviderClient({
      stateDirectory,
      providerEntryPath: 'C:\\installed\\provider.js',
      executablePath: 'C:\\installed\\CleanCode.exe',
      resolveLaunchTarget: async () => ({
        executablePath: 'C:\\runtime\\cleancode-terminal-provider.exe',
        providerEntryPath: 'C:\\runtime\\provider.js',
        runtimeImageKey: '0.1.7-image-key'
      }),
      spawnProcess
    })

    const metadata = await invokeLaunchProvider(client, join(stateDirectory, 'provider.json'))

    expect(spawnProcess).toHaveBeenNthCalledWith(
      1,
      'C:\\runtime\\cleancode-terminal-provider.exe',
      [
        'C:\\runtime\\provider.js',
        '--metadata',
        join(stateDirectory, 'provider.json'),
        '--instance-id',
        expect.any(String),
        '--heartbeat-id',
        expect.any(String)
      ],
      expect.any(Object)
    )
    expect(spawnProcess).toHaveBeenNthCalledWith(
      2,
      'C:\\installed\\CleanCode.exe',
      [
        'C:\\installed\\provider.js',
        '--metadata',
        join(stateDirectory, 'provider.json'),
        '--instance-id',
        metadata.instanceId,
        '--heartbeat-id',
        metadata.liveness?.heartbeatId
      ],
      expect.any(Object)
    )
    expect(metadata).toMatchObject({ processId: 4244 })
    expect(metadata).not.toHaveProperty('runtimeImageKey')
    expect(JSON.parse(await readFile(join(stateDirectory, 'provider.json'), 'utf8'))).toEqual(
      metadata
    )
    const runtimeArguments = (
      spawnProcessMock.mock.calls as unknown as ReadonlyArray<readonly [string, string[]]>
    )[0]![1]
    expect(runtimeArguments[4]).not.toBe(metadata.instanceId)
    expect(runtimeArguments[6]).not.toBe(metadata.liveness?.heartbeatId)
  })

  it('falls back to the installed host when a relocated child exits before readiness', async () => {
    const exitedRuntimeChild = createSpawnedChild(2_147_483_647, 1)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(exitedRuntimeChild)
      .mockReturnValueOnce(createSpawnedChild(4245)) as NonNullable<
      PersistentTerminalProviderClientOptions['spawnProcess']
    >
    const client = new PersistentTerminalProviderClient({
      stateDirectory,
      providerEntryPath: 'C:\\installed\\provider.js',
      executablePath: 'C:\\installed\\CleanCode.exe',
      resolveLaunchTarget: async () => ({
        executablePath: 'C:\\runtime\\cleancode-terminal-provider.exe',
        providerEntryPath: 'C:\\runtime\\provider.js',
        runtimeImageKey: '0.1.7-image-key'
      }),
      spawnProcess
    })
    const readinessFailure = new Error('runtime child exited before readiness')
    const clientInternals = client as unknown as {
      connectOrLaunchWithLock(
        metadataPath: string,
        assertLeaseHealthy: () => Promise<void>
      ): Promise<TerminalProviderMetadata>
      waitForProviderLaunch(
        metadataPath: string,
        metadata: TerminalProviderMetadata
      ): Promise<TerminalProviderMetadata>
    }
    vi.spyOn(clientInternals, 'waitForProviderLaunch').mockImplementation(
      async (_metadataPath, metadata) => {
        if (metadata.runtimeImageKey) throw readinessFailure
        return metadata
      }
    )

    const metadata = await clientInternals.connectOrLaunchWithLock(
      join(stateDirectory, 'provider.json'),
      async () => undefined
    )

    expect(spawnProcess).toHaveBeenCalledTimes(2)
    expect(spawnProcess).toHaveBeenNthCalledWith(
      2,
      'C:\\installed\\CleanCode.exe',
      [
        'C:\\installed\\provider.js',
        '--metadata',
        join(stateDirectory, 'provider.json'),
        '--instance-id',
        metadata.instanceId,
        '--heartbeat-id',
        metadata.liveness?.heartbeatId
      ],
      expect.any(Object)
    )
    expect(metadata).toMatchObject({ processId: 4245 })
    expect(metadata).not.toHaveProperty('runtimeImageKey')
  })

  it('stops waiting as soon as a launched Provider reports exit', async () => {
    let markExited: (() => void) | undefined
    let exited = false
    const completion = new Promise<void>((resolve) => {
      markExited = () => {
        exited = true
        resolve()
      }
    })
    const client = new PersistentTerminalProviderClient({
      stateDirectory,
      providerEntryPath: '/installed/provider.js'
    })
    const clientInternals = client as unknown as {
      connectMetadata(metadata: TerminalProviderMetadata): Promise<void>
      waitForProviderLaunch(
        metadataPath: string,
        metadata: TerminalProviderMetadata,
        exitSignal: { readonly completion: Promise<void>; hasExited(): boolean }
      ): Promise<TerminalProviderMetadata>
    }
    vi.spyOn(clientInternals, 'connectMetadata').mockRejectedValue(
      new Error('endpoint is not ready')
    )
    const metadata: TerminalProviderMetadata = {
      schemaVersion: 1,
      protocolVersion: 1,
      instanceId: 'exited-provider',
      authToken: 'secret',
      endpoint: '/missing/provider.sock',
      processId: 4247,
      startedAt: new Date().toISOString()
    }

    const pending = clientInternals.waitForProviderLaunch(
      join(stateDirectory, 'provider.json'),
      metadata,
      { completion, hasExited: () => exited }
    )
    markExited?.()

    await expect(pending).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_UNAVAILABLE',
      message: 'Terminal provider process exited before it became ready.'
    })
  })

  it('terminates a spawned Provider when the launch fence is lost before final metadata publish', async () => {
    const child = createSpawnedChild(4246)
    const fenceFailure = new Error('launch fence lost')
    let fenceChecks = 0
    const client = new PersistentTerminalProviderClient({
      stateDirectory,
      providerEntryPath: '/installed/provider.js',
      executablePath: '/installed/electron',
      spawnProcess: vi.fn(() => child) as NonNullable<
        PersistentTerminalProviderClientOptions['spawnProcess']
      >
    })
    const clientInternals = client as unknown as {
      launchProvider(
        path: string,
        assertLaunchAllowed: () => Promise<void>
      ): Promise<{ readonly metadata: TerminalProviderMetadata }>
    }

    await expect(
      clientInternals.launchProvider(join(stateDirectory, 'provider.json'), async () => {
        fenceChecks += 1
        if (fenceChecks === 5) throw fenceFailure
      })
    ).rejects.toBe(fenceFailure)

    expect(child.kill).toHaveBeenCalledOnce()
    await expect(readFile(join(stateDirectory, 'provider.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('refreshes the launch lease while a runtime image operation is still running', async () => {
    vi.useFakeTimers()
    const lease: ProviderLaunchLockLease = {
      assertOwned: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined)
    }
    let completeOperation: (() => void) | undefined
    const operation = new Promise<void>((resolve) => {
      completeOperation = resolve
    })
    const tracked = runWithProviderLaunchLock(lease, () => operation)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(lease.refresh).toHaveBeenCalledOnce()
    completeOperation?.()
    await tracked
    expect(lease.close).toHaveBeenCalledOnce()
  })

  it('blocks launch after the launch lease heartbeat loses ownership', async () => {
    vi.useFakeTimers()
    const refreshFailure = new Error('launch lock heartbeat failed')
    const lease: ProviderLaunchLockLease = {
      assertOwned: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      refresh: vi.fn(async () => Promise.reject(refreshFailure))
    }
    let checkLease: (() => Promise<void>) | undefined
    let continueOperation: (() => void) | undefined
    const operation = new Promise<void>((resolve) => {
      continueOperation = resolve
    })
    const tracked = runWithProviderLaunchLock(lease, async (assertLeaseHealthy) => {
      checkLease = assertLeaseHealthy
      await operation
      await assertLeaseHealthy()
    })
    const rejected = expect(tracked).rejects.toBe(refreshFailure)
    await vi.advanceTimersByTimeAsync(5_000)

    continueOperation?.()
    await rejected
    expect(checkLease).toBeTypeOf('function')
    expect(lease.close).toHaveBeenCalledOnce()
  })
})

function invokeLaunchProvider(
  client: PersistentTerminalProviderClient,
  metadataPath: string
): Promise<TerminalProviderMetadata> {
  return (
    client as unknown as {
      launchProvider(path: string): Promise<{ readonly metadata: TerminalProviderMetadata }>
    }
  )
    .launchProvider(metadataPath)
    .then(({ metadata }) => metadata)
}

function createSpawnedChild(processId: number, exitCode: number | null = null): ChildProcess {
  const child = Object.assign(new EventEmitter(), {
    exitCode,
    kill: vi.fn(() => {
      if (child.exitCode === null) Object.assign(child, { exitCode: 1 })
      child.emit('exit', child.exitCode, null)
      return true
    }),
    pid: processId,
    signalCode: null,
    unref: vi.fn()
  }) as unknown as ChildProcess
  return child
}
