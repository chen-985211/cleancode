import type { Logger } from '../../../src/platform/logging/Logger'
import { TerminalAgentActivityIntegrationAdapter } from '../../../src/platform/electron-main/terminalAgentActivityIntegrationAdapter'

describe('terminal Agent activity integration adapter', () => {
  it('maps the Run terminal scope into the Agent-owned environment service', async () => {
    const prepare = vi.fn(async (command) => ({
      environment: { ...command.environment, INTEGRATED: '1' },
      launchCommand: command.launchCommand,
      shell: '/private/activity-shell'
    }))
    const adapter = new TerminalAgentActivityIntegrationAdapter({
      environment: { prepare },
      logger: createLogger()
    })

    await expect(adapter.prepare(runCommand)).resolves.toEqual({
      environment: { EXISTING: 'value', INTEGRATED: '1' },
      launchCommand: undefined,
      shell: '/private/activity-shell'
    })
    expect(prepare).toHaveBeenCalledWith({
      environment: { EXISTING: 'value' },
      launchCommand: undefined,
      shell: undefined,
      terminal: runCommand.scope
    })
  })

  it('fails open and logs diagnostics when optional telemetry preparation fails', async () => {
    const logger = createLogger()
    const adapter = new TerminalAgentActivityIntegrationAdapter({
      environment: {
        prepare: async () => {
          throw new Error('asset directory is unavailable')
        }
      },
      logger
    })

    await expect(adapter.prepare(runCommand)).resolves.toEqual({
      environment: runCommand.environment,
      launchCommand: runCommand.launchCommand,
      shell: runCommand.shell
    })
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'prepareTerminalAgentActivity',
        outcome: 'failure',
        scope: 'agent.terminal-activity'
      })
    )
  })
})

const runCommand = {
  environment: { EXISTING: 'value' },
  launchCommand: undefined,
  launchMode: undefined,
  shell: undefined,
  scope: {
    blockId: 'terminal-block-1',
    generation: 1,
    gitBranch: 'main',
    owner: { id: 'terminal-block-1', kind: 'block' as const },
    projectDirectory: '/project',
    projectId: 'project-1',
    runId: 'terminal-run-1',
    sessionId: 'terminal-session-1',
    workspaceDirectory: '/workspace',
    workspaceId: 'workspace-1'
  },
  sessionKind: 'interactive' as const,
  workingDirectory: '/workspace'
}

function createLogger(): Logger & {
  readonly warn: ReturnType<typeof vi.fn<Logger['warn']>>
} {
  const warn = vi.fn<Logger['warn']>()
  return { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn }
}
