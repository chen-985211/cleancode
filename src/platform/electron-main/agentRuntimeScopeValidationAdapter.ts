import type {
  AgentRuntimeScopeValidationCommand,
  AgentRuntimeScopeValidationPort
} from '../../contexts/agent/application/ports/AgentRuntimeScopeValidationPort'
import type { AgentSessionRepository } from '../../contexts/agent/application/ports/AgentSessionRepository'
import type { ProjectRegistryRepository } from '../../contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import { ValidateProjectWorkspaceScopeUseCase } from '../../contexts/project/application/use-cases/ValidateProjectWorkspaceScopeUseCase'

export class AgentRuntimeScopeValidationAdapter implements AgentRuntimeScopeValidationPort {
  constructor(
    private readonly agents: AgentSessionRepository,
    private readonly validateProjectScope: ValidateProjectWorkspaceScopeUseCase
  ) {}

  async isValid(command: AgentRuntimeScopeValidationCommand): Promise<boolean> {
    const [agent, projectScopeIsValid] = await Promise.all([
      this.agents.findAgent(command.projectId, command.workspaceId, command.agentId),
      this.validateProjectScope.execute(command)
    ])
    return Boolean(agent && projectScopeIsValid)
  }
}

export function createAgentRuntimeScopeValidation(
  agents: AgentSessionRepository,
  projectRegistry: ProjectRegistryRepository,
  projects: ProjectRepository
): AgentRuntimeScopeValidationPort {
  return new AgentRuntimeScopeValidationAdapter(
    agents,
    new ValidateProjectWorkspaceScopeUseCase(projects, projectRegistry)
  )
}
