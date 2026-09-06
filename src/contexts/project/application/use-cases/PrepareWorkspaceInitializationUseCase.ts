import type { ProjectRepository } from '../ports/ProjectRepository'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { BranchWorkspaceDirectoryPort } from '../ports/BranchWorkspaceDirectoryPort'
import type { WorkspaceInitializationRepository } from '../ports/WorkspaceInitializationRepository'
import type { WorkspaceInitializationContentPort } from '../ports/WorkspaceInitializationContentPort'
import type { CreateBranchWorkspaceCommand } from './CreateBranchWorkspaceUseCase'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'
import { Project, type ProjectSnapshot } from '../../domain/aggregates/Project'
import {
  WorkspaceInitialization,
  type WorkspaceInitializationSnapshot
} from '../../domain/aggregates/WorkspaceInitialization'
import {
  normalizeWorkspaceDefaults,
  type WorkspaceDefaults
} from '../../domain/value-objects/WorkspaceDefaults'
import {
  createExpectedAppError,
  getAppErrorCode
} from '../../../../shared-kernel/application/errors/AppError'

export interface CreateInitializedWorkspaceCommand {
  readonly projectDirectory: string
  readonly branchName: string
  readonly requestId?: string
  readonly defaults?: WorkspaceDefaults
}

export interface BeginEmptyCanvasInitializationCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly requestId: string
  readonly defaults: WorkspaceDefaults
}

export interface WorkspaceInitializationPreparationDependencies {
  readonly projects: ProjectRepository
  readonly registry: ProjectRegistryRepository
  readonly git: GitWorkspacePort
  readonly directories: BranchWorkspaceDirectoryPort
  readonly repository: WorkspaceInitializationRepository
  readonly content: WorkspaceInitializationContentPort
  readonly transactions: ProjectWorkspaceTransactionCoordinator
  readonly createWorkspace: (
    command: CreateBranchWorkspaceCommand,
    onWorktreeCreated?: () => Promise<void>
  ) => Promise<ProjectSnapshot>
}

export class PrepareWorkspaceInitializationUseCase {
  private readonly requests = new ProjectWorkspaceTransactionCoordinator()
  constructor(private readonly dependencies: WorkspaceInitializationPreparationDependencies) {}

  async getDefaults(projectDirectory: string): Promise<WorkspaceDefaults> {
    const project = await this.requireProject(projectDirectory)
    return this.dependencies.repository.getDefaults(project.id)
  }
  async saveDefaults(projectDirectory: string, defaults: WorkspaceDefaults): Promise<void> {
    await this.dependencies.transactions.run(projectDirectory, async () => {
      const project = await this.requireProject(projectDirectory)
      await this.dependencies.repository.saveDefaults(
        project.id,
        normalizeWorkspaceDefaults(defaults)
      )
    })
  }
  async create(command: CreateInitializedWorkspaceCommand): Promise<ProjectSnapshot> {
    const requestId = command.requestId ?? globalThis.crypto.randomUUID()
    return this.requests.run(requestId, () => this.createOnce({ ...command, requestId }))
  }
  async beginEmpty(
    command: BeginEmptyCanvasInitializationCommand
  ): Promise<WorkspaceInitializationSnapshot> {
    return this.requests.run(`${command.projectDirectory}:${command.workspaceId}`, async () => {
      const project = await this.requireProject(command.projectDirectory)
      const existing = await this.dependencies.repository.find(command.requestId)
      if (existing) {
        this.assertRequest(existing, project, command.workspaceId)
        return existing
      }
      const workspace = project.workspaces.find((item) => item.workspaceId === command.workspaceId)
      if (!workspace) stale()
      const operation = WorkspaceInitialization.create({
        id: command.requestId,
        projectId: project.id,
        projectDirectory: project.directory,
        workspaceId: workspace.workspaceId,
        workspaceDirectory: workspace.directory,
        branchName: workspace.gitBranch,
        defaults: command.defaults,
        mode: 'empty-canvas'
      })
      if (!(await this.dependencies.content.isEmpty(operation.toSnapshot()))) {
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_CANVAS_NOT_EMPTY',
          'The canvas already contains objects.'
        )
      }
      const active = (
        await this.dependencies.repository.list(project.id, workspace.workspaceId)
      ).find((item) => item.stage !== 'complete' && item.stage !== 'cancelled')
      if (active)
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_CONFLICT',
          'This workspace already has an unfinished initialization.'
        )
      await this.dependencies.repository.save(operation.toSnapshot())
      await this.prepareItems(operation)
      operation.activate()
      await this.dependencies.repository.save(operation.toSnapshot())
      return operation.toSnapshot()
    })
  }

  async cancelOne(projectDirectory: string, initializationId: string): Promise<void> {
    const project = await this.requireProject(projectDirectory)
    const snapshot = await this.dependencies.repository.find(initializationId)
    if (
      !snapshot ||
      snapshot.projectId !== project.id ||
      snapshot.projectDirectory !== project.directory
    )
      stale()
    const operation = WorkspaceInitialization.restore(snapshot)
    operation.cancel()
    await this.dependencies.repository.save(operation.toSnapshot())
  }

  async cancel(projectDirectory: string, workspaceId?: string): Promise<void> {
    const project = await this.dependencies.projects.findByDirectory(projectDirectory)
    if (!project) return
    for (const snapshot of await this.dependencies.repository.list(project.id, workspaceId)) {
      if (snapshot.stage === 'cancelled' || snapshot.stage === 'complete') continue
      const operation = WorkspaceInitialization.restore(snapshot)
      operation.cancel()
      await this.dependencies.repository.save(operation.toSnapshot())
    }
  }

  private async createOnce(
    command: CreateInitializedWorkspaceCommand & { readonly requestId: string }
  ): Promise<ProjectSnapshot> {
    let project = await this.requireProject(command.projectDirectory)
    let snapshot = await this.dependencies.repository.find(command.requestId)
    if (!snapshot) {
      const inspection = await this.dependencies.git.inspectRepository(project.directory)
      if (inspection.localBranches.includes(command.branchName.trim())) {
        throw createExpectedAppError('GIT_BRANCH_ALREADY_EXISTS', 'Git branch already exists.')
      }
      const workspaceDirectory = this.dependencies.directories.resolveBranchWorkspaceDirectory({
        projectDirectory: project.directory,
        branchName: command.branchName.trim()
      })
      const operation = WorkspaceInitialization.create({
        id: command.requestId,
        projectId: project.id,
        projectDirectory: project.directory,
        workspaceId: globalThis.crypto.randomUUID(),
        workspaceDirectory,
        branchName: command.branchName.trim(),
        mode: 'new-workspace',
        defaults: command.defaults ?? (await this.dependencies.repository.getDefaults(project.id))
      })
      await this.dependencies.repository.save(operation.toSnapshot())
      await this.prepareItems(operation)
      snapshot = operation.toSnapshot()
    }
    this.assertRequest(snapshot, project, snapshot.workspaceId)
    if (snapshot.branchName !== command.branchName.trim() || snapshot.mode !== 'new-workspace') {
      throw createExpectedAppError(
        'WORKSPACE_INITIALIZATION_CONFLICT',
        'Workspace creation request has different contents.'
      )
    }
    const reserved = snapshot
    if (!project.workspaces.some((workspace) => workspace.workspaceId === reserved.workspaceId)) {
      const inspection = await this.dependencies.git.inspectRepository(project.directory)
      const matching = inspection.branches.find(
        (branch) =>
          branch.name === reserved.branchName &&
          branch.worktreeDirectory === reserved.workspaceDirectory
      )
      if (matching) {
        if (!snapshot.worktreeCreated)
          throw createExpectedAppError(
            'WORKSPACE_INITIALIZATION_CONFLICT',
            'An existing worktree has no creation receipt for this request.'
          )
        const discovered = project.workspaces.find(
          (workspace) =>
            workspace.directory === snapshot!.workspaceDirectory &&
            workspace.gitBranch === snapshot!.branchName
        )
        if (discovered) {
          const rebound = WorkspaceInitialization.restore(snapshot)
          rebound.rebindDiscoveredWorkspace(discovered.workspaceId)
          if (!(await this.dependencies.content.isEmpty(rebound.toSnapshot())))
            throw createExpectedAppError(
              'WORKSPACE_INITIALIZATION_CANVAS_NOT_EMPTY',
              'The discovered workspace already contains objects.'
            )
          await this.dependencies.repository.save(rebound.toSnapshot())
          snapshot = rebound.toSnapshot()
          project = await this.dependencies.transactions.run(project.directory, async () => {
            const latest = await this.requireProject(command.projectDirectory)
            const selected = Project.fromSnapshot(latest).switchCurrentWorkspace(
              discovered.workspaceId
            )
            await this.dependencies.projects.save(selected)
            return selected.toSnapshot()
          })
        } else project = await this.recoverWorkspace(snapshot)
      } else {
        project = await this.dependencies.createWorkspace(
          {
            projectDirectory: project.directory,
            branchName: command.branchName,
            workspaceId: snapshot.workspaceId
          },
          async () => {
            const confirmed = WorkspaceInitialization.restore(snapshot!)
            confirmed.confirmWorktreeCreated()
            await this.dependencies.repository.save(confirmed.toSnapshot())
            snapshot = confirmed.toSnapshot()
          }
        )
      }
    }
    if (
      !project.workspaces.some(
        (workspace) => workspace.workspaceId === snapshot!.workspaceId && workspace.isCurrent
      )
    ) {
      const targetId = snapshot.workspaceId
      project = await this.dependencies.transactions.run(project.directory, async () => {
        const latest = await this.requireProject(command.projectDirectory)
        const selected = Project.fromSnapshot(latest).switchCurrentWorkspace(targetId)
        await this.dependencies.projects.save(selected)
        return selected.toSnapshot()
      })
    }
    const operation = WorkspaceInitialization.restore(snapshot)
    operation.activate()
    await this.dependencies.repository.save(operation.toSnapshot())
    return project
  }

  private async recoverWorkspace(
    snapshot: WorkspaceInitializationSnapshot
  ): Promise<ProjectSnapshot> {
    return this.dependencies.transactions.run(snapshot.projectDirectory, async () => {
      const project = await this.requireProject(snapshot.projectDirectory)
      if (
        project.workspaces.some((workspace) => workspace.directory === snapshot.workspaceDirectory)
      ) {
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_CONFLICT',
          'The worktree is already registered with another identity.'
        )
      }
      const inspection = await this.dependencies.git.inspectRepository(snapshot.projectDirectory)
      if (
        !inspection.branches.some(
          (branch) =>
            branch.name === snapshot.branchName &&
            branch.worktreeDirectory === snapshot.workspaceDirectory
        )
      )
        stale()
      const recovered = Project.fromSnapshot(project).addLinkedWorktreeWorkspace({
        workspaceId: snapshot.workspaceId,
        displayName: snapshot.branchName!,
        gitBranch: snapshot.branchName!,
        directory: snapshot.workspaceDirectory
      })
      await this.dependencies.projects.save(recovered)
      return recovered.toSnapshot()
    })
  }

  private async prepareItems(operation: WorkspaceInitialization): Promise<void> {
    for (const item of operation.toSnapshot().items) {
      try {
        const name =
          item.kind === 'template'
            ? await this.dependencies.content.prepareTemplate(operation.toSnapshot(), item)
            : item.name
        operation.prepare(item.id, name)
      } catch (error) {
        operation.fail(item.id, getAppErrorCode(error) ?? 'UNEXPECTED_ERROR')
      }
      await this.dependencies.repository.save(operation.toSnapshot())
    }
  }

  private async requireProject(directory: string): Promise<ProjectSnapshot> {
    const project = await this.dependencies.projects.findByDirectory(directory)
    if (!project) throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    const registry = await this.dependencies.registry.get()
    if (!registry.projectDirectories.includes(project.directory))
      throw createExpectedAppError('PROJECT_NOT_REMEMBERED', 'Project is no longer remembered.')
    return project
  }
  private assertRequest(
    snapshot: WorkspaceInitializationSnapshot,
    project: ProjectSnapshot,
    workspaceId: string
  ): void {
    if (
      snapshot.projectId !== project.id ||
      snapshot.projectDirectory !== project.directory ||
      snapshot.workspaceId !== workspaceId ||
      snapshot.stage === 'cancelled'
    )
      stale()
  }
}

function stale(): never {
  throw createExpectedAppError(
    'WORKSPACE_INITIALIZATION_SCOPE_STALE',
    'Workspace initialization scope is stale.'
  )
}
