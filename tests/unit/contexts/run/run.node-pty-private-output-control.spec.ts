import type { IDisposable, IPty } from 'node-pty'

import type { StartTerminalProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  NodePtyTerminalProcessAdapter,
  type NodePtyTerminalProcessAdapterOptions
} from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'

const nodePtyModuleMock = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock('node-pty', () => ({ spawn: nodePtyModuleMock.spawn }))

const outputControlToken = '0123456789abcdef0123456789abcdef'
const beginMarker = `\x1b]633;CLEANCODE_OUTPUT_CONTROL:${outputControlToken}:begin\x07`
const endMarker = `\x1b]633;CLEANCODE_OUTPUT_CONTROL:${outputControlToken}:end\x07`

describe('NodePtyTerminalProcessAdapter private output control', () => {
  it('activates private environment atomically and filters guarded ConPTY output', async () => {
    const pty = new ControllablePty()
    const spawnPty = vi.fn<NonNullable<NodePtyTerminalProcessAdapterOptions['spawnPty']>>(() => pty)
    const adapter = createWindowsAdapter(spawnPty)
    const output: string[] = []

    await adapter.start(
      createStartCommand({
        environment: {
          CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: outputControlToken,
          CLEANCODE_TERMINAL_SOURCE_THEME: 'light'
        },
        onOutput: (event) => output.push(event.data),
        terminalSourceTheme: 'light',
        privateOutputControl: {
          protocol: 'osc-633-span-v1',
          token: outputControlToken,
          environment: {
            CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: 'descriptor-cannot-replace-run-token',
            CLEANCODE_TERMINAL_SOURCE_THEME: 'dark'
          }
        }
      })
    )

    const spawnEnvironment = spawnPty.mock.calls[0]?.[2].env
    expect(spawnEnvironment).toMatchObject({
      CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: outputControlToken,
      CLEANCODE_TERMINAL_SOURCE_THEME: 'light'
    })

    pty.emitData(`profile output\r\n${beginMarker}\x1b[0;30;107m${endMarker}`)
    pty.emitData('\x1b[38;2;12;34;56mprovider output\r\n')
    pty.emitData(`\x1b[0m${beginMarker}\x1b[0;37;40m${endMarker}PS> `)

    expect(output.join('')).toBe(
      'profile output\r\n\x1b[38;2;12;34;56mprovider output\r\n\x1b[0mPS> '
    )
  })

  it('does not activate an invalid descriptor or consume its output', async () => {
    const pty = new ControllablePty()
    const spawnPty = vi.fn<NonNullable<NodePtyTerminalProcessAdapterOptions['spawnPty']>>(() => pty)
    const adapter = createWindowsAdapter(spawnPty)
    const output: string[] = []
    const invalidToken = 'token with spaces'
    const invalidBegin = `\x1b]633;CLEANCODE_OUTPUT_CONTROL:${invalidToken}:begin\x07`
    const invalidEnd = `\x1b]633;CLEANCODE_OUTPUT_CONTROL:${invalidToken}:end\x07`

    await adapter.start(
      createStartCommand({
        environment: {
          CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: outputControlToken,
          CLEANCODE_TERMINAL_SOURCE_THEME: 'light'
        },
        onOutput: (event) => output.push(event.data),
        privateOutputControl: {
          protocol: 'osc-633-span-v1',
          token: invalidToken,
          environment: {
            CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: invalidToken
          }
        }
      })
    )

    expect(spawnPty.mock.calls[0]?.[2].env).not.toHaveProperty(
      'CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN'
    )
    expect(spawnPty.mock.calls[0]?.[2].env).not.toHaveProperty('CLEANCODE_TERMINAL_SOURCE_THEME')

    pty.emitData(`before${invalidBegin}\x1b[0;30;107m${invalidEnd}after`)

    expect(output.join('')).toBe(`before${invalidBegin}\x1b[0;30;107m${invalidEnd}after`)
  })

  it('routes an incomplete private span through the foreground gate when the PTY exits', async () => {
    const pty = new ControllablePty()
    const adapter = createWindowsAdapter(() => pty)
    const output: string[] = []
    const onForegroundExit = vi.fn()

    await adapter.start(
      createStartCommand({
        onOutput: (event) => output.push(event.data),
        privateOutputControl: {
          protocol: 'osc-633-span-v1',
          token: outputControlToken,
          environment: {}
        }
      })
    )
    adapter.launchForegroundJob({
      args: [],
      environment: {},
      executable: 'codex',
      generation: 1,
      launchId: 'foreground-launch-1',
      onExit: onForegroundExit,
      onStarted: vi.fn(),
      sessionId: 'private-output-control-session'
    })

    pty.emitData(`${beginMarker}\x1b[0;30;107m`)
    pty.emitExit({ exitCode: 0 })

    expect(output).toEqual([])
    expect(onForegroundExit).toHaveBeenCalledWith(
      expect.objectContaining({ exitCode: null, launchId: 'foreground-launch-1' })
    )
  })
})

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
      sessionId: 'private-output-control-session',
      workspaceDirectory: 'C:\\project',
      workspaceId: 'main'
    },
    workingDirectory: 'C:\\project',
    ...overrides
  }
}

function createWindowsAdapter(
  spawnPty: NonNullable<NodePtyTerminalProcessAdapterOptions['spawnPty']>
): NodePtyTerminalProcessAdapter {
  return new NodePtyTerminalProcessAdapter({
    environment: { SystemRoot: String.raw`C:\Windows` },
    resolveShellExecutable: async () =>
      String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
    runtimePlatform: 'win32',
    spawnPty
  })
}

interface PtyExitEvent {
  readonly exitCode: number
  readonly signal?: number
}

class ControllablePty implements IPty {
  readonly cols = 80
  readonly handleFlowControl = false
  readonly pid = 202
  readonly process = 'powershell.exe'
  readonly rows = 24
  private readonly dataListeners: Array<(data: string) => void> = []
  private readonly exitListeners: Array<(event: PtyExitEvent) => void> = []

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

  emitExit(event: PtyExitEvent): void {
    for (const listener of this.exitListeners) listener(event)
  }

  clear(): void {}
  kill(): void {}
  pause(): void {}
  resize(): void {}
  resume(): void {}
  write(): void {}
}
