import { posix, win32 } from 'node:path'

import { RunAgentTerminalRuntimeAdapter } from '../../../../src/contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter'
import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'

describe('Agent terminal environment contract', () => {
  it.each(['darwin', 'linux'] as const)(
    'initializes terminals with detected PATH and offers refreshed paths as fallback on %s',
    async (platform) => {
      const environment = { PATH: '/first/bin', PRIVATE_VALUE: 'not-a-launch-variable' }
      const { runtime, processes } = createRuntime(environment, platform)
      await runtime.open(openCommand())
      expect(processes.start.mock.calls[0]?.[0].environment).toMatchObject({ PATH: '/first/bin' })
      expect(processes.start.mock.calls[0]?.[0].environment).not.toHaveProperty('PRIVATE_VALUE')

      environment.PATH = ['/updated/bin', '/usr/bin'].join(posix.delimiter)
      runtime.launch({
        sessionId: 'agent-session',
        onExit: vi.fn(),
        plan: { executable: 'example-agent', args: [], env: { PROVIDER_OPTION: 'enabled' } }
      })
      expect(processes.launchForegroundJob.mock.calls[0]?.[0].environment).toMatchObject({
        PROVIDER_OPTION: 'enabled'
      })
      expect(processes.launchForegroundJob.mock.calls[0]?.[0].environment).not.toHaveProperty(
        'PATH'
      )
      expect(processes.launchForegroundJob.mock.calls[0]?.[0].fallbackPath).toBe(environment.PATH)
      expect(processes.launchForegroundJob.mock.calls[0]?.[0].environment).not.toHaveProperty(
        'PRIVATE_VALUE'
      )
      expect(processes.start.mock.calls[0]?.[0].environment?.PATH).toBe('/first/bin')
    }
  )

  it.each(['/explicit/bin', ''])('preserves an explicit launch PATH of %j', async (path) => {
    const { runtime, processes } = createRuntime({ PATH: '/detected/bin' }, 'darwin')
    await runtime.open(openCommand())
    const env = { PATH: path, PROVIDER_OPTION: 'enabled' }
    runtime.launch({
      sessionId: 'agent-session',
      onExit: vi.fn(),
      plan: { executable: '/explicit/agent', args: [], env }
    })
    expect(processes.launchForegroundJob.mock.calls[0]?.[0].environment).toMatchObject(env)
    expect(env).toEqual({ PATH: path, PROVIDER_OPTION: 'enabled' })
  })

  it.each([{}, { PATH: '' }])(
    'keeps backend inheritance when no usable PATH is available: %j',
    async (environment) => {
      const { runtime, processes } = createRuntime(environment, 'darwin')
      await runtime.open(openCommand())
      runtime.launch({
        sessionId: 'agent-session',
        onExit: vi.fn(),
        plan: { executable: 'example-agent', args: [], env: {} }
      })
      expect(processes.start.mock.calls[0]?.[0].environment).not.toHaveProperty('PATH')
      expect(processes.launchForegroundJob.mock.calls[0]?.[0].environment).not.toHaveProperty(
        'PATH'
      )
      expect(processes.launchForegroundJob.mock.calls[0]?.[0].fallbackPath).toBeUndefined()
    }
  )

  it('preserves Windows shell PATH inheritance and explicit case-insensitive overrides', async () => {
    const { runtime, processes } = createRuntime({ PATH: 'C:\\detected' }, 'win32')
    await runtime.open(openCommand())
    const path = ['C:\\explicit', 'C:\\Windows\\System32'].join(win32.delimiter)
    runtime.launch({
      sessionId: 'agent-session',
      onExit: vi.fn(),
      plan: { executable: 'example-agent', args: [], env: { Path: path } }
    })
    expect(processes.start.mock.calls[0]?.[0].environment).not.toHaveProperty('PATH')
    expect(processes.launchForegroundJob.mock.calls[0]?.[0].environment).toHaveProperty(
      'Path',
      path
    )
    expect(processes.launchForegroundJob.mock.calls[0]?.[0].environment).not.toHaveProperty('PATH')
    expect(processes.launchForegroundJob.mock.calls[0]?.[0].fallbackPath).toBeUndefined()
  })
})

function createRuntime(environment: NodeJS.ProcessEnv, platform: NodeJS.Platform) {
  const processes = {
    start: vi.fn<TerminalProcessPort['start']>(async () => ({ processId: 42 })),
    launchForegroundJob: vi.fn<NonNullable<TerminalProcessPort['launchForegroundJob']>>(),
    write: vi.fn(),
    resize: vi.fn(),
    pauseOutput: vi.fn(),
    resumeOutput: vi.fn(),
    readWorkingDirectory: vi.fn(async () => '/repo/app'),
    stop: vi.fn(async () => undefined),
    disposeAll: vi.fn(async () => undefined)
  } satisfies TerminalProcessPort
  const runtime = new RunAgentTerminalRuntimeAdapter(new TerminalSessionService(processes), {
    environment,
    platform
  })
  return { runtime, processes }
}

function openCommand() {
  return {
    agentId: 'agent-1',
    columns: 80,
    gitBranch: null,
    onTerminalExit: vi.fn(),
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    rows: 24,
    sessionId: 'agent-session',
    terminalSourceTheme: 'dark' as const,
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
}
