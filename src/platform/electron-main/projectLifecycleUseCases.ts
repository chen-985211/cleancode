import type { BranchWorkspaceDirectoryPort } from '../../contexts/project/application/ports/BranchWorkspaceDirectoryPort'
import type { GitWorkspacePort } from '../../contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRegistryRepository } from '../../contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../../contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import type { WorkspaceRunLifecyclePort } from '../../contexts/project/application/ports/WorkspaceRunLifecyclePort'
import { ArchiveBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase'
import { CheckoutMainWorkspaceBranchUseCase } from '../../contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'
import { CreateBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/CreateBranchWorkspaceUseCase'
import { CreateOrOpenProjectUseCase } from '../../contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import { ForgetProjectUseCase } from '../../contexts/project/application/use-cases/ForgetProjectUseCase'
import { ProjectRegistryTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import { ProjectWorkspaceTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { RememberProjectUseCase } from '../../contexts/project/application/use-cases/RememberProjectUseCase'
import { ReorderProjectsUseCase } from '../../contexts/project/application/use-cases/ReorderProjectsUseCase'
import { SelectCurrentProjectUseCase } from '../../contexts/project/application/use-cases/SelectCurrentProjectUseCase'
import { SwitchBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/SwitchBranchWorkspaceUseCase'
import { SynchronizeProjectGitStateUseCase } from '../../contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'
import type { ProjectIpcHandlersInput } from './projectIpcHandlers'
import { createWorkspaceExternalOpenRuntime } from './workspaceExternalOpenRuntimeComposition'

export function createProjectLifecycleUseCases(input: {
  readonly agentLifecycle: WorkspaceAgentLifecyclePort
  readonly runLifecycle: WorkspaceRunLifecyclePort
  readonly branchDirectories: BranchWorkspaceDirectoryPort
  readonly gitWorkspace: GitWorkspacePort
  readonly projectRegistry: ProjectRegistryRepository
  readonly projects: ProjectRepository
  readonly workspaceTransactions?: ProjectWorkspaceTransactionCoordinator
}) {
  const registryTransactions = new ProjectRegistryTransactionCoordinator()
  const workspaceTransactions =
    input.workspaceTransactions ?? new ProjectWorkspaceTransactionCoordinator()
  const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(
    input.projects,
    input.gitWorkspace,
    input.agentLifecycle,
    workspaceTransactions,
    input.runLifecycle
  )
  const checkoutMainWorkspaceBranch = new CheckoutMainWorkspaceBranchUseCase(
    input.projects,
    input.gitWorkspace,
    workspaceTransactions
  )
  const createBranchWorkspace = new CreateBranchWorkspaceUseCase(
    input.projects,
    input.gitWorkspace,
    input.branchDirectories,
    workspaceTransactions
  )
  const createOrOpenProjectUseCase = new CreateOrOpenProjectUseCase(
    input.projects,
    input.gitWorkspace,
    input.agentLifecycle,
    workspaceTransactions,
    input.runLifecycle
  )
  const forgetProject = new ForgetProjectUseCase(
    input.projectRegistry,
    input.agentLifecycle,
    workspaceTransactions,
    registryTransactions,
    input.runLifecycle
  )
  const rememberProjectUseCase = new RememberProjectUseCase(
    input.projectRegistry,
    registryTransactions
  )
  const reorderProjects = new ReorderProjectsUseCase(input.projectRegistry, registryTransactions)
  const selectCurrentProjectUseCase = new SelectCurrentProjectUseCase(
    input.projectRegistry,
    registryTransactions
  )
  const switchBranchWorkspace = new SwitchBranchWorkspaceUseCase(
    input.projects,
    workspaceTransactions
  )
  const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(
    input.projects,
    input.gitWorkspace,
    input.agentLifecycle,
    workspaceTransactions,
    input.runLifecycle
  )
  const projectIpcHandlers = {
    archiveBranchWorkspace: (command) => archiveBranchWorkspace.execute(command),
    checkoutMainWorkspaceBranch: (command) => checkoutMainWorkspaceBranch.execute(command),
    createBranchWorkspace: (command) => createBranchWorkspace.execute(command),
    createOrOpenProject: (command) => createOrOpenProjectUseCase.execute(command),
    forgetProject: (directory) => forgetProject.execute({ directory }),
    reorderProjects: (command) => reorderProjects.execute(command),
    switchBranchWorkspace: (command) => switchBranchWorkspace.execute(command),
    synchronizeProjectGitState: (command) => synchronizeProjectGitState.execute(command),
    ...createWorkspaceExternalOpenRuntime(input.projects)
  } satisfies Pick<
    ProjectIpcHandlersInput,
    | 'archiveBranchWorkspace'
    | 'checkoutMainWorkspaceBranch'
    | 'createBranchWorkspace'
    | 'createOrOpenProject'
    | 'forgetProject'
    | 'getWorkspaceExternalOpenCapabilities'
    | 'openWorkspaceExternally'
    | 'reorderProjects'
    | 'switchBranchWorkspace'
    | 'synchronizeProjectGitState'
  >

  return {
    createOrOpenProjectUseCase,
    projectIpcHandlers,
    rememberProjectUseCase,
    selectCurrentProjectUseCase
  }
}
