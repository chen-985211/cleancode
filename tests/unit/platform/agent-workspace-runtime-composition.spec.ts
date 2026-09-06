import { createAgentWorkspaceRuntime } from '../../../src/platform/electron-main/createAgentWorkspaceRuntime'
import { AgentProviderAvailabilityService } from '../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { allowAgentWorkspaceCreationScope } from '../../../src/contexts/agent/application/ports/AgentWorkspaceCreationScopePort'
import { defaultAgentProviderPreferencesRepository } from '../../../src/contexts/agent/application/ports/AgentProviderPreferencesRepository'
import {
  toWorkspaceAgentSnapshot,
  type WorkspaceAgentSnapshot
} from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentSession } from '../../../src/contexts/agent/domain/aggregates/AgentSession'
import { RecordingAgentProviderRegistry } from '../../fixtures/agentTerminalRuntime'

describe('Agent workspace runtime composition', () => {
  it('reuses initialization receipts when the created Agent is no longer in the workspace', async () => {
    let receipt: WorkspaceAgentSnapshot | null = null
    const repository = {
      find: vi.fn(async () => null),
      findAgent: vi.fn(async () => null),
      findWorkspace: vi.fn(async () => []),
      initializeWorkspace: vi.fn(async () => []),
      save: vi.fn(async (agent: AgentSession) => {
        receipt = toWorkspaceAgentSnapshot(agent)
      }),
      delete: vi.fn(),
      deleteAgent: vi.fn(),
      deleteProject: vi.fn()
    }
    const creations = { findCreation: vi.fn(async () => receipt) }
    const providers = new RecordingAgentProviderRegistry()
    const runtime = createAgentWorkspaceRuntime(
      repository,
      providers,
      new AgentProviderAvailabilityService(providers),
      allowAgentWorkspaceCreationScope,
      defaultAgentProviderPreferencesRepository,
      creations
    )
    const command = {
      agentId: 'agent-1',
      initialPosition: { x: 240, y: 320 },
      projectDirectory: '/project',
      projectId: 'project-1',
      providerId: 'codex',
      workspaceDirectory: '/project/feature',
      workspaceId: 'workspace-1'
    }

    const first = await runtime.createWorkspaceAgentUseCase.execute(command, 'initialization-item')
    const retried = await runtime.createWorkspaceAgentUseCase.execute(
      command,
      'initialization-item'
    )

    expect(retried).toEqual(first)
    expect(repository.save).toHaveBeenCalledOnce()
    expect(repository.save).toHaveBeenCalledWith(expect.anything(), 'initialization-item')
    expect(creations.findCreation).toHaveBeenLastCalledWith(
      'project-1',
      'workspace-1',
      'initialization-item'
    )
  })
})
