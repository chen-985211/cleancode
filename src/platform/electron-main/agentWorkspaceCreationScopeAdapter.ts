import type {
  AgentWorkspaceCreationScope,
  AgentWorkspaceCreationScopePort
} from '../../contexts/agent/application/ports/AgentWorkspaceCreationScopePort'
import type { ProjectWorkspaceTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import type { ValidateProjectWorkspaceScopeUseCase } from '../../contexts/project/application/use-cases/ValidateProjectWorkspaceScopeUseCase'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'

export class AgentWorkspaceCreationScopeAdapter implements AgentWorkspaceCreationScopePort {
  constructor(
    private readonly validation: ValidateProjectWorkspaceScopeUseCase,
    private readonly transactions: ProjectWorkspaceTransactionCoordinator
  ) {}

  run<T>(scope: AgentWorkspaceCreationScope, operation: () => Promise<T>): Promise<T> {
    return this.transactions.run(scope.projectDirectory, async () => {
      if (!(await this.validation.execute(scope))) {
        throw createExpectedAppError(
          'AGENT_WORKSPACE_SCOPE_STALE',
          'Agent workspace scope is no longer active.'
        )
      }
      return operation()
    })
  }
}
