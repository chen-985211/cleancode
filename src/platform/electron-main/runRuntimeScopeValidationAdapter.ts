import type { ProjectRegistryRepository } from '../../contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import { ValidateProjectWorkspaceScopeUseCase } from '../../contexts/project/application/use-cases/ValidateProjectWorkspaceScopeUseCase'
import type {
  RunRuntimeScopeValidationPort,
  ValidateRunRuntimeScopeCommand
} from '../../contexts/run/application/ports/RunRuntimeScopeValidationPort'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'

export class RunRuntimeScopeValidationAdapter implements RunRuntimeScopeValidationPort {
  constructor(private readonly validateProjectScope: ValidateProjectWorkspaceScopeUseCase) {}

  async validate(command: ValidateRunRuntimeScopeCommand): Promise<void> {
    if (await this.validateProjectScope.execute(command)) {
      return
    }

    throw createExpectedAppError(
      'RUN_SCOPE_STALE',
      'The terminal runtime scope no longer matches the remembered Project workspace.'
    )
  }
}

export function createRunRuntimeScopeValidation(
  projectRegistry: ProjectRegistryRepository,
  projects: ProjectRepository
): RunRuntimeScopeValidationPort {
  return new RunRuntimeScopeValidationAdapter(
    new ValidateProjectWorkspaceScopeUseCase(projects, projectRegistry)
  )
}
