import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'

describe('Native CLI initial prompt', () => {
  it.each(['codex', 'claude-code'] as const)(
    'passes a single literal interactive prompt to %s',
    async (providerId) => {
      const contribution =
        providerId === 'codex'
          ? new CodexAgentProviderContribution({
              telemetryFactory: async () => ({
                dispose: async () => undefined,
                env: {},
                notifyCommand: ['report']
              })
            })
          : new ClaudeCodeAgentProviderContribution()
      const artifacts = new AgentLaunchArtifactScope()
      const initialPrompt = '--literal "quoted" $HOME `text`\nCall wait_agent_message.'
      try {
        const plan = await contribution.launcher.createLaunchPlan({
          artifacts,
          initialPrompt,
          onProviderSessionIdentified: () => undefined,
          workspaceDirectory: '/repo'
        })
        expect(plan.args.slice(-2)).toEqual(['--', initialPrompt])
        expect(plan.args).not.toContain('--print')
        expect(plan.args).not.toContain('exec')
      } finally {
        artifacts.seal()
        await artifacts.dispose()
      }
    }
  )
})
