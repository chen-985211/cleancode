import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'

import type { IDisposable, IPty } from 'node-pty'

import type { StartTerminalProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'

const nodePtyMock = vi.hoisted(() => ({
  spawn: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn: nodePtyMock.spawn }))

interface WindowsTerminalExitCoordinator {
  acceptExitCode(exitCode: unknown): void
  acceptOutputClosed(): void
}

interface PtyExitEvent {
  readonly exitCode: number
  readonly signal?: number
}

interface WindowsTerminalModule {
  readonly WindowsTerminal: new (
    file?: string,
    args?: string[],
    options?: Record<string, unknown>
  ) => {
    kill(): void
    onExit(listener: (event: PtyExitEvent) => void): IDisposable
  }
  readonly WindowsTerminalExitEventCoordinator: new (
    onExit: (exitCode: unknown) => void
  ) => WindowsTerminalExitCoordinator
}

interface WindowsPtyAgentModule {
  readonly WindowsPtyAgent: new () => unknown
}

const nodeRequire = createRequire(import.meta.url)
const { WindowsTerminal, WindowsTerminalExitEventCoordinator } = nodeRequire(
  'node-pty/lib/windowsTerminal'
) as WindowsTerminalModule
const { WindowsPtyAgent } = nodeRequire('node-pty/lib/windowsPtyAgent') as WindowsPtyAgentModule

describe('patched node-pty Windows terminal exit coordination', () => {
  it.each(['kill', 'destroy'] as const)(
    'runs %s immediately before the first ConPTY output instead of deferring shutdown',
    (method) => {
      const terminal = createPreReadyWindowsTerminalHarness()

      terminal[method]()

      expect(terminal.close).toHaveBeenCalledOnce()
      expect(terminal.nativeKill).toHaveBeenCalledOnce()
      expect(terminal.acceptOutputClosed).toHaveBeenCalledOnce()
      expect(terminal.deferreds).toEqual([])
    }
  )

  it('rejects Windows signals before queuing any pre-ready shutdown work', () => {
    const terminal = createPreReadyWindowsTerminalHarness()

    expect(() => terminal.kill('SIGTERM')).toThrow('Signals not supported on windows.')
    expect(terminal.close).not.toHaveBeenCalled()
    expect(terminal.nativeKill).not.toHaveBeenCalled()
    expect(terminal.acceptOutputClosed).not.toHaveBeenCalled()
    expect(terminal.deferreds).toEqual([])
  })

  it('coalesces repeated kill and destroy calls into one pre-ready shutdown', () => {
    const terminal = createPreReadyWindowsTerminalHarness()

    terminal.kill()
    terminal.destroy()
    terminal.kill()

    expect(terminal.close).toHaveBeenCalledOnce()
    expect(terminal.nativeKill).toHaveBeenCalledOnce()
    expect(terminal.acceptOutputClosed).toHaveBeenCalledOnce()
    expect(terminal.deferreds).toEqual([])
  })

  it('allows a terminal shutdown retry when the native agent rejects the first close', () => {
    const terminal = createPreReadyWindowsTerminalHarness()
    terminal.nativeKill.mockImplementationOnce(() => {
      throw new Error('duplicate handle failed')
    })

    expect(() => terminal.kill()).toThrow('duplicate handle failed')
    expect(() => terminal.kill()).not.toThrow()

    expect(terminal.close).toHaveBeenCalledTimes(2)
    expect(terminal.nativeKill).toHaveBeenCalledTimes(2)
    expect(terminal.acceptOutputClosed).toHaveBeenCalledOnce()
  })

  it('settles a silent bundled ConPTY worker exactly once across repeated agent kills', () => {
    const agent = createBundledConptyAgentHarness()

    agent.kill()
    agent.kill()

    expect(agent.destroyInput).toHaveBeenCalledOnce()
    expect(agent.nativeKill).toHaveBeenCalledOnce()
    expect(agent.disposeWorker).toHaveBeenCalledOnce()
    expect(agent.listenForDrainData).toHaveBeenCalledOnce()
  })

  it('allows an agent kill retry after a native process-handle failure', () => {
    const agent = createBundledConptyAgentHarness()
    agent.nativeKill.mockImplementationOnce(() => {
      throw new Error('duplicate handle failed')
    })

    expect(() => agent.kill()).toThrow('duplicate handle failed')
    expect(() => agent.kill()).not.toThrow()

    expect(agent.nativeKill).toHaveBeenCalledTimes(2)
    expect(agent.disposeWorker).toHaveBeenCalledOnce()
    expect(agent.listenForDrainData).toHaveBeenCalledOnce()
  })

  it('absorbs delayed pipe errors while disposing a failed ConPTY spawn', () => {
    const agent = createFailedConptySpawnHarness()

    agent.disposeFailedSpawn()

    expect(() => agent.inputSocket.emit('error', new Error('input pipe missing'))).not.toThrow()
    expect(() => agent.outputSocket.emit('error', new Error('output pipe missing'))).not.toThrow()
    expect(agent.nativeKill).toHaveBeenCalledOnce()
    expect(agent.disposeWorker).toHaveBeenCalledOnce()
    expect(agent.destroyInput).toHaveBeenCalledOnce()
    expect(agent.destroyOutput).toHaveBeenCalledOnce()
  })

  it('emits exit when shutdown happens before ready_datapipe can close output', () => {
    expect(runPreReadyExitScenario()).toEqual([0])
  })

  it.each([
    {
      firstSignal: 'output-close' as const,
      secondSignal: 'exit-code' as const
    },
    {
      firstSignal: 'exit-code' as const,
      secondSignal: 'output-close' as const
    }
  ])(
    'emits exactly once after output close and native exit when $firstSignal arrives first',
    ({ firstSignal, secondSignal }) => {
      const exits: unknown[] = []
      const coordinator = new WindowsTerminalExitEventCoordinator((exitCode) =>
        exits.push(exitCode)
      )

      acceptSignal(coordinator, firstSignal, 7)
      expect(exits).toEqual([])

      acceptSignal(coordinator, secondSignal, 7)
      acceptSignal(coordinator, firstSignal, 99)
      acceptSignal(coordinator, secondSignal, 99)

      expect(exits).toEqual([7])
    }
  )

  it('treats an observed but invalid native exit code as ready for boundary normalization', () => {
    const exits: unknown[] = []
    const coordinator = new WindowsTerminalExitEventCoordinator((exitCode) => exits.push(exitCode))

    coordinator.acceptOutputClosed()
    coordinator.acceptExitCode(undefined)

    expect(exits).toEqual([undefined])
  })
})

function createPreReadyWindowsTerminalHarness() {
  const acceptOutputClosed = vi.fn()
  const close = vi.fn()
  const nativeKill = vi.fn()
  const deferreds: Array<{ run: () => void }> = []
  const terminal = Object.create(WindowsTerminal.prototype) as {
    _agent: { kill: () => void }
    _close: () => void
    _deferreds: Array<{ run: () => void }>
    _exitEvent: { acceptOutputClosed: () => void }
    _isDataPipeReady: boolean
    _isReady: boolean
    _shutdownIssued: boolean
    destroy(): void
    kill(signal?: string): void
  }
  terminal._agent = { kill: nativeKill }
  terminal._close = close
  terminal._deferreds = deferreds
  terminal._exitEvent = { acceptOutputClosed }
  terminal._isDataPipeReady = false
  terminal._isReady = false
  terminal._shutdownIssued = false

  return {
    acceptOutputClosed,
    close,
    deferreds,
    destroy: () => terminal.destroy(),
    kill: (signal?: string) => terminal.kill(signal),
    nativeKill
  }
}

function createBundledConptyAgentHarness() {
  const destroyInput = vi.fn()
  const disposeWorker = vi.fn()
  const listenForDrainData = vi.fn()
  const nativeKill = vi.fn()
  const agent = Object.create(WindowsPtyAgent.prototype) as {
    _conoutSocketWorker: { dispose: () => void }
    _inSocket: { destroy: () => void }
    _killRequested: boolean
    _outSocket: { on: (event: string, listener: () => void) => void }
    _pty: number
    _ptyNative: { kill: (pty: number, useConptyDll: boolean) => void }
    _useConpty: boolean
    _useConptyDll: boolean
    kill(): void
  }
  agent._conoutSocketWorker = { dispose: disposeWorker }
  agent._inSocket = { destroy: destroyInput }
  agent._killRequested = false
  agent._outSocket = { on: listenForDrainData }
  agent._pty = 42
  agent._ptyNative = { kill: nativeKill }
  agent._useConpty = true
  agent._useConptyDll = true

  return {
    destroyInput,
    disposeWorker,
    kill: () => agent.kill(),
    listenForDrainData,
    nativeKill
  }
}

function createFailedConptySpawnHarness() {
  const destroyInput = vi.fn()
  const destroyOutput = vi.fn()
  const disposeWorker = vi.fn()
  const inputSocket = Object.assign(new EventEmitter(), { destroy: destroyInput })
  const nativeKill = vi.fn()
  const outputSocket = Object.assign(new EventEmitter(), { destroy: destroyOutput })
  const agent = Object.create(WindowsPtyAgent.prototype) as {
    _conoutSocketWorker: { dispose: () => void }
    _disposeFailedSpawn(): void
    _inSocket: EventEmitter & { destroy: () => void }
    _outSocket: EventEmitter & { destroy: () => void }
    _pty: number
    _ptyNative: { kill: (pty: number, useConptyDll: boolean) => void }
    _useConptyDll: boolean
  }
  agent._conoutSocketWorker = { dispose: disposeWorker }
  agent._inSocket = inputSocket
  agent._outSocket = outputSocket
  agent._pty = 42
  agent._ptyNative = { kill: nativeKill }
  agent._useConptyDll = true

  return {
    destroyInput,
    destroyOutput,
    disposeFailedSpawn: () => agent._disposeFailedSpawn(),
    disposeWorker,
    inputSocket,
    nativeKill,
    outputSocket
  }
}

function runPreReadyExitScenario(): unknown[] {
  const agentPath = nodeRequire.resolve('node-pty/lib/windowsPtyAgent')
  const terminalPath = nodeRequire.resolve('node-pty/lib/windowsTerminal')
  const cachedAgentModule = nodeRequire.cache[agentPath]
  const cachedTerminalModule = nodeRequire.cache[terminalPath]
  if (cachedAgentModule === undefined || cachedTerminalModule === undefined) {
    throw new Error('Patched node-pty Windows modules must be loaded before the exit scenario')
  }

  const originalAgentExports = cachedAgentModule.exports
  const outputSocket = new EventEmitter()
  let processExitListener: ((exitCode: number) => void) | undefined

  class PreReadyWindowsPtyAgent {
    readonly exitCode = 0
    readonly fd = 0
    readonly innerPid = 4815
    readonly outSocket = outputSocket
    readonly processExitCodeReady = true
    readonly pty = 42

    onProcessExit(listener: (exitCode: number) => void): void {
      processExitListener = listener
    }

    kill(): void {
      processExitListener?.(this.exitCode)
    }
  }

  try {
    cachedAgentModule.exports = { WindowsPtyAgent: PreReadyWindowsPtyAgent }
    delete nodeRequire.cache[terminalPath]
    const { WindowsTerminal: IsolatedWindowsTerminal } = nodeRequire(
      terminalPath
    ) as WindowsTerminalModule
    const terminal = new IsolatedWindowsTerminal('powershell.exe', [], {})
    const exits: unknown[] = []
    terminal.onExit((event) => exits.push(event.exitCode))

    terminal.kill()

    return exits
  } finally {
    cachedAgentModule.exports = originalAgentExports
    nodeRequire.cache[terminalPath] = cachedTerminalModule
  }
}

describe('NodePtyTerminalProcessAdapter exit boundary', () => {
  beforeEach(() => {
    nodePtyMock.spawn.mockReset()
  })

  it.each([
    { exitCode: 0, expected: 0 },
    { exitCode: 7, expected: 7 },
    { exitCode: -1, expected: -1 },
    { exitCode: Number.MAX_SAFE_INTEGER, expected: Number.MAX_SAFE_INTEGER },
    { exitCode: undefined, expected: null },
    { exitCode: null, expected: null },
    { exitCode: Number.NaN, expected: null },
    { exitCode: Number.POSITIVE_INFINITY, expected: null },
    { exitCode: 1.5, expected: null },
    { exitCode: '0', expected: null }
  ])('normalizes node-pty exit code $exitCode to $expected', async ({ exitCode, expected }) => {
    const pty = new ControllablePty()
    nodePtyMock.spawn.mockReturnValue(pty)
    const adapter = new NodePtyTerminalProcessAdapter()
    const onExit = vi.fn()

    await adapter.start(createStartCommand(onExit))
    pty.emitExit(exitCode)

    expect(onExit).toHaveBeenCalledOnce()
    expect(onExit).toHaveBeenCalledWith(
      expect.objectContaining({ exitCode: expected, sessionId: 'windows-exit-session' })
    )
  })
})

class ControllablePty implements IPty {
  readonly cols = 80
  readonly handleFlowControl = false
  readonly pid = 4815
  readonly process = 'powershell.exe'
  readonly rows = 24
  private readonly exitListeners: Array<(event: PtyExitEvent) => void> = []

  onData(): IDisposable {
    return { dispose: () => undefined }
  }

  onExit(listener: (event: PtyExitEvent) => void): IDisposable {
    this.exitListeners.push(listener)
    return { dispose: () => undefined }
  }

  emitExit(exitCode: unknown): void {
    for (const listener of this.exitListeners) {
      listener({ exitCode } as PtyExitEvent)
    }
  }

  clear(): void {}
  kill(): void {}
  pause(): void {}
  resize(): void {}
  resume(): void {}
  write(): void {}
}

function acceptSignal(
  coordinator: WindowsTerminalExitCoordinator,
  signal: 'exit-code' | 'output-close',
  exitCode: unknown
): void {
  if (signal === 'exit-code') {
    coordinator.acceptExitCode(exitCode)
    return
  }
  coordinator.acceptOutputClosed()
}

function createStartCommand(
  onExit: StartTerminalProcessCommand['onExit']
): StartTerminalProcessCommand {
  const sessionId = 'windows-exit-session'
  return {
    columns: 80,
    onExit,
    onOutput: () => undefined,
    rows: 24,
    scope: {
      blockId: 'terminal-1',
      generation: 1,
      gitBranch: 'main',
      owner: { id: 'terminal-1', kind: 'block' },
      projectDirectory: 'C:\\project',
      projectId: 'project-1',
      runId: 'run-1',
      sessionId,
      workspaceDirectory: 'C:\\project',
      workspaceId: 'main'
    },
    shell: 'powershell.exe',
    workingDirectory: 'C:\\project'
  }
}
