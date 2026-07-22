import type { AgentRuntimeScopeValidationCommand } from '../../../src/contexts/agent/application/ports/AgentRuntimeScopeValidationPort'
import type { AgentSessionRepository } from '../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSession } from '../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import type { ProjectRegistryRepository } from '../../../src/contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../../../src/contexts/project/application/ports/ProjectRepository'
import {
  createAgentRuntimeScopeValidation,
  type AgentRuntimeScopeValidationAdapter
} from '../../../src/platform/electron-main/agentRuntimeScopeValidationAdapter'

const command: AgentRuntimeScopeValidationCommand = {
  agentId: 'agent-1',
  gitBranch: 'main',
  projectDirectory: '/repo/app',
  projectId: 'project-1',
  workspaceDirectory: '/repo/app',
  workspaceName: 'main'
}

describe('Agent runtime scope validation adapter', () => {
  it('accepts only a remembered, current Project workspace and registered Agent identity', async () => {
    await expect(createAdapter({}).isValid(command)).resolves.toBe(true)

    for (const invalidState of [
      { agentExists: false },
      { gitBranch: 'feature/theme' },
      { projectRemembered: false },
      { workspaceDirectory: '/repo/other' }
    ]) {
      await expect(createAdapter(invalidState).isValid(command)).resolves.toBe(false)
    }
  })
})

function createAdapter(input: {
  readonly agentExists?: boolean
  readonly gitBranch?: string
  readonly projectRemembered?: boolean
  readonly workspaceDirectory?: string
}): AgentRuntimeScopeValidationAdapter {
  const scope = AgentConversationScope.create({
    agentId: command.agentId,
    gitBranch: command.gitBranch,
    projectId: command.projectId,
    workspaceName: command.workspaceName
  })
  const agent = AgentSession.start(scope, 'codex')
  const agents = {
    delete: vi.fn(async () => undefined),
    deleteAgent: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    find: vi.fn(async () => agent),
    findAgent: vi.fn(async () => (input.agentExists === false ? null : agent)),
    findWorkspace: vi.fn(async () => [agent]),
    save: vi.fn(async () => undefined)
  } satisfies AgentSessionRepository
  const projects = {
    findByDirectory: vi.fn(async () => ({
      directory: command.projectDirectory,
      id: command.projectId,
      name: 'app',
      workspaces: [
        {
          directory: input.workspaceDirectory ?? command.workspaceDirectory,
          gitBranch: input.gitBranch ?? command.gitBranch,
          isCurrent: true,
          name: command.workspaceName
        }
      ]
    })),
    save: vi.fn(async () => undefined)
  } satisfies ProjectRepository
  const registry = {
    get: vi.fn(async () => ({
      currentProjectDirectory: input.projectRemembered === false ? null : command.projectDirectory,
      projectDirectories: input.projectRemembered === false ? [] : [command.projectDirectory]
    })),
    save: vi.fn(async () => undefined)
  } satisfies ProjectRegistryRepository

  return createAgentRuntimeScopeValidation(
    agents,
    registry,
    projects
  ) as AgentRuntimeScopeValidationAdapter
}
