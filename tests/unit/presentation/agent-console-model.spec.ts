import {
  createFallbackAgent,
  createLegacyAgentSnapshot
} from '../../../src/presentation/app-shell/agentConsoleModel'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('Agent console model', () => {
  it('uses the same renderer legacy Provider for both fallback projections', () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const workspace = workbench.project.workspaces[0]!

    const fallbackAgent = createFallbackAgent(workbench, workspace)
    const legacyAgent = createLegacyAgentSnapshot(workbench, workspace)

    expect(fallbackAgent.providerId).toBe('codex')
    expect(legacyAgent?.providerId).toBe(fallbackAgent.providerId)
  })
})
