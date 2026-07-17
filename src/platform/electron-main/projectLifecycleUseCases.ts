import type { BranchWorkspaceDirectoryPort } from '../../contexts/project/application/ports/BranchWorkspaceDirectoryPort'
import type { GitWorkspacePort } from '../../contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRegistryRepository } from '../../contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../../contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import { ArchiveBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase'
import { CheckoutMainWorkspaceBranchUseCase } from '../../contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'
import { CreateBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/CreateBranchWorkspaceUseCase'
import { CreateOrOpenProjectUseCase } from '../../contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import { ForgetProjectUseCase } from '../../contexts/project/application/use-cases/ForgetProjectUseCase'
import { ProjectRegistryTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import { ProjectWorkspaceTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { RememberProjectUseCase } from '../../contexts/project/application/use-cases/RememberProjectUseCase'
import { SelectCurrentProjectUseCase } from '../../contexts/project/application/use-cases/SelectCurrentProjectUseCase'
import { SwitchBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/SwitchBranchWorkspaceUseCase'
import { SynchronizeProjectGitStateUseCase } from '../../contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'

export function createProjectLifecycleUseCases(input: {
  readonly agentLifecycle: WorkspaceAgentLifecyclePort
  readonly branchDirectories: BranchWorkspaceDirectoryPort
  readonly gitWorkspace: GitWorkspacePort
  readonly projectRegistry: ProjectRegistryRepository
  readonly projects: ProjectRepository
}) {
  const registryTransactions = new ProjectRegistryTransactionCoordinator()
  const workspaceTransactions = new ProjectWorkspaceTransactionCoordinator()
  return {
    archiveBranchWorkspaceUseCase: new ArchiveBranchWorkspaceUseCase(
      input.projects,
      input.gitWorkspace,
      input.agentLifecycle,
      workspaceTransactions
    ),
    checkoutMainWorkspaceBranchUseCase: new CheckoutMainWorkspaceBranchUseCase(
      input.projects,
      input.gitWorkspace,
      input.agentLifecycle,
      workspaceTransactions
    ),
    createBranchWorkspaceUseCase: new CreateBranchWorkspaceUseCase(
      input.projects,
      input.gitWorkspace,
      input.branchDirectories,
      workspaceTransactions
    ),
    createOrOpenProjectUseCase: new CreateOrOpenProjectUseCase(
      input.projects,
      input.gitWorkspace,
      input.agentLifecycle,
      workspaceTransactions
    ),
    forgetProjectUseCase: new ForgetProjectUseCase(
      input.projectRegistry,
      input.agentLifecycle,
      workspaceTransactions,
      registryTransactions
    ),
    rememberProjectUseCase: new RememberProjectUseCase(input.projectRegistry, registryTransactions),
    selectCurrentProjectUseCase: new SelectCurrentProjectUseCase(
      input.projectRegistry,
      registryTransactions
    ),
    switchBranchWorkspaceUseCase: new SwitchBranchWorkspaceUseCase(
      input.projects,
      workspaceTransactions
    ),
    synchronizeProjectGitStateUseCase: new SynchronizeProjectGitStateUseCase(
      input.projects,
      input.gitWorkspace,
      input.agentLifecycle,
      workspaceTransactions
    )
  }
}
