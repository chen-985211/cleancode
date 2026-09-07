import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'

import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'
import { GeminiAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/gemini/GeminiAgentProviderContribution'

describe('Native CLI initial prompt', () => {
  it.each(['codex', 'claude-code', 'opencode', 'gemini'] as const)(
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
          : providerId === 'claude-code'
            ? new ClaudeCodeAgentProviderContribution()
            : providerId === 'opencode'
              ? new OpenCodeAgentProviderContribution()
              : new GeminiAgentProviderContribution()
      const artifacts = new AgentLaunchArtifactScope()
      const initialPrompt = '--literal "quoted" $HOME `text`\nCall wait_agent_message.'
      try {
        const plan = await contribution.launcher.createLaunchPlan({
          artifacts,
          initialPrompt,
          onProviderSessionIdentified: () => undefined,
          workspaceDirectory: '/repo'
        })
        const flag =
          providerId === 'opencode'
            ? '--prompt'
            : providerId === 'gemini'
              ? '--prompt-interactive'
              : '--'
        expect(plan.args[plan.args.indexOf(flag) + 1]).toBe(initialPrompt)
        expect(plan.args).not.toContain('--print')
        expect(plan.args).not.toContain('exec')
      } finally {
        artifacts.seal()
        await artifacts.dispose()
      }
    }
  )
})
