import { createFallbackAgent } from '../../../src/presentation/app-shell/agentConsoleModel'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('Agent console model', () => {
  it('uses Codex only for the isolated Agent console fallback', () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const workspace = workbench.project.workspaces[0]!

    const fallbackAgent = createFallbackAgent(workbench, workspace)

    expect(fallbackAgent.providerId).toBe('codex')
  })
})
