import { createRequire } from 'node:module'

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
  readonly WindowsTerminalExitEventCoordinator: new (
    onExit: (exitCode: unknown) => void
  ) => WindowsTerminalExitCoordinator
}

const nodeRequire = createRequire(import.meta.url)
const { WindowsTerminalExitEventCoordinator } = nodeRequire(
  'node-pty/lib/windowsTerminal'
) as WindowsTerminalModule

describe('patched node-pty Windows terminal exit coordination', () => {
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
