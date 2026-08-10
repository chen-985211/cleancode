import type { IDisposable, IPty } from 'node-pty'

import type { StartTerminalProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  NodePtyTerminalProcessAdapter,
  type NodePtyTerminalProcessAdapterOptions
} from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'

const nodePtyModuleMock = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock('node-pty', () => ({ spawn: nodePtyModuleMock.spawn }))

const AUTO_PWSH = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`
const INBOX_POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

describe('Windows automatic PowerShell synchronous spawn fallback', () => {
  beforeEach(() => {
    nodePtyModuleMock.spawn.mockReset()
  })

  it.each([
    'File not found: C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'Cannot create process, error code: 193'
  ])('falls back from automatic pwsh for %s', async (message) => {
    const primaryError = new Error(message)
    const fallbackPty = new ControllablePty(202)
    const spawnPty = vi
      .fn()
      .mockImplementationOnce(() => {
        throw primaryError
      })
      .mockReturnValueOnce(fallbackPty)
    const adapter = createWindowsAdapter({ spawnPty })

    await expect(adapter.start(createStartCommand())).resolves.toEqual({ processId: 202 })

    expect(spawnPty).toHaveBeenCalledTimes(2)
    expect(spawnPty.mock.calls.map(([executable]) => executable)).toEqual([
      AUTO_PWSH,
      INBOX_POWERSHELL
    ])
    expect(readManagedShell(adapter)).toBe(INBOX_POWERSHELL)
    expect(spawnPty.mock.calls.flat().join(' ')).not.toContain('cmd.exe')
  })

  it('preserves a non-launch ConPTY error without fallback', async () => {
    const failure = new Error('Cannot launch conpty')
    const spawnPty = vi.fn(() => {
      throw failure
    })
    const adapter = createWindowsAdapter({ spawnPty })

    await expect(adapter.start(createStartCommand())).rejects.toBe(failure)

    expect(spawnPty).toHaveBeenCalledOnce()
  })

  it('never falls back for an explicitly selected pwsh executable', async () => {
    const failure = new Error('Cannot create process, error code: 193')
    const spawnPty = vi.fn(() => {
      throw failure
    })
    const adapter = createWindowsAdapter({ spawnPty })

    await expect(adapter.start(createStartCommand({ shell: AUTO_PWSH }))).rejects.toBe(failure)

    expect(spawnPty).toHaveBeenCalledOnce()
  })

  it('never falls back on a non-Windows platform', async () => {
    const failure = new Error('Cannot create process, error code: 193')
    const spawnPty = vi.fn(() => {
      throw failure
    })
    const adapter = new NodePtyTerminalProcessAdapter({
      resolveShellExecutable: async () => AUTO_PWSH,
      runtimePlatform: 'linux',
      spawnPty
    })

    await expect(adapter.start(createStartCommand())).rejects.toBe(failure)

    expect(spawnPty).toHaveBeenCalledOnce()
  })

  it('attempts inbox Windows PowerShell only once when it was already selected', async () => {
    const failure = new Error('Cannot create process, error code: 193')
    const spawnPty = vi.fn(() => {
      throw failure
    })
    const adapter = createWindowsAdapter({
      resolveShellExecutable: async () => INBOX_POWERSHELL,
      spawnPty
    })

    await expect(adapter.start(createStartCommand())).rejects.toBe(failure)

    expect(spawnPty).toHaveBeenCalledOnce()
    expect(spawnPty).toHaveBeenCalledWith(INBOX_POWERSHELL, expect.any(Array), expect.any(Object))
  })

  it('does not spawn when automatic shell resolution itself fails', async () => {
    const failure = new Error('resolver failed')
    const spawnPty = vi.fn()
    const adapter = createWindowsAdapter({
      resolveShellExecutable: async () => Promise.reject(failure),
      spawnPty
    })

    await expect(adapter.start(createStartCommand())).rejects.toBe(failure)

    expect(spawnPty).not.toHaveBeenCalled()
  })

  it('aggregates both attempted shell failures in order and never tries cmd', async () => {
    const primaryError = new Error('Cannot create process, error code: 193')
    const fallbackError = new Error('Cannot launch conpty')
    const spawnPty = vi
      .fn()
      .mockImplementationOnce(() => {
        throw primaryError
      })
      .mockImplementationOnce(() => {
        throw fallbackError
      })
    const adapter = createWindowsAdapter({ spawnPty })

    const failure = await adapter.start(createStartCommand()).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([primaryError, fallbackError])
    expect((failure as Error).message).toContain(AUTO_PWSH)
    expect((failure as Error).message).toContain(INBOX_POWERSHELL)
    expect((failure as Error).message).not.toContain('cmd.exe')
    expect(spawnPty).toHaveBeenCalledTimes(2)
  })

  it('does not reinterpret later shell output or exit as a spawn failure', async () => {
    const output = vi.fn()
    const onExit = vi.fn()
    const pty = new ControllablePty(303)
    const spawnPty = vi.fn(() => pty)
    const adapter = createWindowsAdapter({ spawnPty })

    await adapter.start(createStartCommand({ onExit, onOutput: output }))
    pty.emitData('Cannot create process, error code: 193')
    pty.emitExit(193)

    expect(spawnPty).toHaveBeenCalledOnce()
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'Cannot create process, error code: 193' })
    )
    expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 193 }))
  })
})

interface AdapterTestOptions {
  readonly resolveShellExecutable?: () => Promise<string>
  readonly spawnPty: NonNullable<NodePtyTerminalProcessAdapterOptions['spawnPty']>
}

function createWindowsAdapter(options: AdapterTestOptions): NodePtyTerminalProcessAdapter {
  return new NodePtyTerminalProcessAdapter({
    environment: { SystemRoot: String.raw`C:\Windows` },
    resolveShellExecutable: options.resolveShellExecutable ?? (async () => AUTO_PWSH),
    runtimePlatform: 'win32',
    spawnPty: options.spawnPty
  })
}

function readManagedShell(adapter: NodePtyTerminalProcessAdapter): string | undefined {
  const processes = (
    adapter as unknown as {
      readonly processes: Map<string, { readonly shell: string }>
    }
  ).processes
  return processes.get('powershell-fallback-session')?.shell
}

function createStartCommand(
  overrides: Partial<StartTerminalProcessCommand> = {}
): StartTerminalProcessCommand {
  return {
    columns: 80,
    onExit: () => undefined,
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
      sessionId: 'powershell-fallback-session',
      workspaceDirectory: 'C:\\project',
      workspaceId: 'main'
    },
    workingDirectory: 'C:\\project',
    ...overrides
  }
}

interface PtyExitEvent {
  readonly exitCode: number
  readonly signal?: number
}

class ControllablePty implements IPty {
  readonly cols = 80
  readonly handleFlowControl = false
  readonly process = 'powershell.exe'
  readonly rows = 24
  private readonly dataListeners: Array<(data: string) => void> = []
  private readonly exitListeners: Array<(event: PtyExitEvent) => void> = []

  constructor(readonly pid: number) {}

  onData(listener: (data: string) => void): IDisposable {
    this.dataListeners.push(listener)
    return { dispose: () => undefined }
  }

  onExit(listener: (event: PtyExitEvent) => void): IDisposable {
    this.exitListeners.push(listener)
    return { dispose: () => undefined }
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data)
  }

  emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode })
  }

  clear(): void {}
  kill(): void {}
  pause(): void {}
  resize(): void {}
  resume(): void {}
  write(): void {}
}
