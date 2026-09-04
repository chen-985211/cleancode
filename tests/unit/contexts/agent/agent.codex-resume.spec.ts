import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'

const threadId = '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'

describe('Codex resume eligibility', () => {
  it.each(['available', 'missing', 'unavailable'] as const)(
    'only replaces a saved reference when the Provider confirms it is missing (%s)',
    async (status) => {
      const inspectThread = vi.fn(async () => status)
      const contribution = new CodexAgentProviderContribution({
        baseArgs: ['--config', 'profile="dev"'],
        threadResumabilityInspector: inspectThread,
        telemetryFactory: async () => ({
          dispose: async () => undefined,
          env: {},
          notifyCommand: []
        })
      })
      const artifacts = new AgentLaunchArtifactScope()
      const profile = {
        arguments: ['--config', 'model="test"'],
        environment: { CODEX_HOME: '/isolated/codex' },
        executable: '/custom/codex'
      }
      try {
        const plan = await contribution.launcher.createLaunchPlan({
          artifacts,
          launchProfile: profile,
          onProviderSessionIdentified: () => undefined,
          providerSessionRef: { formatVersion: 1, kind: 'codex-thread', value: threadId },
          workspaceDirectory: '/workspace'
        })
        expect(plan.args.includes('resume')).toBe(status !== 'missing')
        expect(plan.discardProviderSessionRef).toBe(status === 'missing')
        expect(inspectThread).toHaveBeenCalledWith({
          appServerArgs: ['--config', 'profile="dev"', ...profile.arguments],
          environment: profile.environment,
          executable: profile.executable,
          threadId,
          workspaceDirectory: '/workspace'
        })
      } finally {
        artifacts.seal()
        await artifacts.dispose()
      }
    }
  )
})
