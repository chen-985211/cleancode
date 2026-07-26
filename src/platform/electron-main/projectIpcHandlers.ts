import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

export interface ProjectIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly selectProjectDirectory: () => Promise<string | null>
  readonly inferProjectName: (directory: string) => string
  readonly createOrOpenProject: (command: {
    readonly directory: string
    readonly name: string
  }) => Promise<ProjectSnapshot>
  readonly createBranchWorkspace: (command: {
    readonly projectDirectory: string
    readonly branchName: string
  }) => Promise<ProjectSnapshot>
  readonly switchBranchWorkspace: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
  }) => Promise<ProjectSnapshot>
  readonly archiveBranchWorkspace: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly lockedWorktreeConfirmation?: { readonly lockReason: string | null }
  }) => Promise<ProjectSnapshot>
  readonly checkoutMainWorkspaceBranch: (command: {
    readonly projectDirectory: string
    readonly branchName: string
  }) => Promise<ProjectSnapshot>
  readonly synchronizeProjectGitState: (command: {
    readonly projectDirectory: string
  }) => Promise<ProjectSnapshot | null>
  readonly forgetProject: (directory: string) => Promise<unknown>
  readonly rememberProject: (directory: string) => Promise<void>
  readonly reorderProjects: (command: {
    readonly projectDirectory: string
    readonly beforeProjectDirectory: string | null
  }) => Promise<unknown>
  readonly selectCurrentProject: (directory: string) => Promise<void>
  readonly loadWorkbench: (project: ProjectSnapshot) => Promise<WorkbenchSnapshot>
  readonly loadRememberedWorkbenches: () => Promise<WorkbenchSnapshot[]>
}

export function registerProjectIpcHandlers(input: ProjectIpcHandlersInput): void {
  registerIpcHandler<void, WorkbenchSnapshot | null>({
    channel: 'cleancode:add-project',
    handler: async () => {
      const projectDirectory = await input.selectProjectDirectory()

      if (!projectDirectory) {
        return null
      }

      const project = await input.createOrOpenProject({
        directory: projectDirectory,
        name: input.inferProjectName(projectDirectory)
      })

      await input.rememberProject(project.directory)

      return input.loadWorkbench(project)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'addProject',
    scope: 'project.workspace',
    successLogLevel: 'info'
  })

  registerIpcHandler<void, WorkbenchSnapshot[]>({
    channel: 'cleancode:list-workbenches',
    handler: () => input.loadRememberedWorkbenches(),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listWorkbenches',
    scope: 'project.workspace'
  })

  registerIpcHandler<unknown, WorkbenchSnapshot>({
    channel: 'cleancode:create-branch-workspace',
    handler: async (command) => {
      const project = await input.createBranchWorkspace({
        projectDirectory: readStringField(command, 'projectDirectory'),
        branchName: readStringField(command, 'branchName')
      })

      return loadAndSelectWorkbench(input, project)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'createBranchWorkspace',
    scope: 'project.git',
    successLogLevel: 'info'
  })

  registerIpcHandler<unknown, WorkbenchSnapshot>({
    channel: 'cleancode:switch-branch-workspace',
    handler: async (command) => {
      const project = await input.switchBranchWorkspace({
        projectDirectory: readStringField(command, 'projectDirectory'),
        workspaceId: readStringField(command, 'workspaceId')
      })

      return loadAndSelectWorkbench(input, project)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'switchBranchWorkspace',
    scope: 'project.workspace',
    successLogLevel: 'info'
  })

  registerIpcHandler<unknown, WorkbenchSnapshot>({
    channel: 'cleancode:archive-branch-workspace',
    handler: async (command) => {
      const lockedWorktreeConfirmation = readLockedWorktreeConfirmation(command)
      const project = await input.archiveBranchWorkspace({
        projectDirectory: readStringField(command, 'projectDirectory'),
        workspaceId: readStringField(command, 'workspaceId'),
        ...(lockedWorktreeConfirmation ? { lockedWorktreeConfirmation } : {})
      })

      return loadAndSelectWorkbench(input, project)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'archiveBranchWorkspace',
    scope: 'project.git',
    successLogLevel: 'info'
  })

  registerIpcHandler<unknown, WorkbenchSnapshot>({
    channel: 'cleancode:checkout-main-workspace-branch',
    handler: async (command) => {
      const project = await input.checkoutMainWorkspaceBranch({
        projectDirectory: readStringField(command, 'projectDirectory'),
        branchName: readStringField(command, 'branchName')
      })

      return loadAndSelectWorkbench(input, project)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'checkoutMainWorkspaceBranch',
    scope: 'project.git',
    successLogLevel: 'info'
  })

  registerIpcHandler<unknown, WorkbenchSnapshot | null>({
    channel: 'cleancode:synchronize-project-git-state',
    handler: async (command) => {
      const project = await input.synchronizeProjectGitState({
        projectDirectory: readStringField(command, 'projectDirectory')
      })

      return project ? input.loadWorkbench(project) : null
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'synchronizeProjectGitState',
    scope: 'project.git'
  })

  registerIpcHandler<{ readonly projectDirectory: string }, WorkbenchSnapshot[]>({
    channel: 'cleancode:remove-project',
    handler: async (command) => {
      await input.forgetProject(command.projectDirectory)

      return input.loadRememberedWorkbenches()
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'removeProject',
    scope: 'project.workspace',
    successLogLevel: 'info'
  })

  registerIpcHandler<unknown, WorkbenchSnapshot[]>({
    channel: 'cleancode:reorder-project',
    handler: async (command) => {
      await input.reorderProjects({
        projectDirectory: readStringField(command, 'projectDirectory'),
        beforeProjectDirectory: readNullableStringField(command, 'beforeProjectDirectory')
      })

      return input.loadRememberedWorkbenches()
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'reorderProject',
    scope: 'project.workspace'
  })
}

async function loadAndSelectWorkbench(
  input: ProjectIpcHandlersInput,
  project: ProjectSnapshot
): Promise<WorkbenchSnapshot> {
  const workbench = await input.loadWorkbench(project)

  await input.selectCurrentProject(project.directory)

  return workbench
}

function readStringField(command: unknown, fieldName: string): string {
  if (!isRecord(command) || typeof command[fieldName] !== 'string') {
    throw createExpectedAppError(
      'INVALID_IPC_COMMAND',
      `Invalid IPC command: ${fieldName} is required.`
    )
  }

  return command[fieldName]
}

function readNullableStringField(command: unknown, fieldName: string): string | null {
  if (
    !isRecord(command) ||
    (typeof command[fieldName] !== 'string' && command[fieldName] !== null)
  ) {
    throw createExpectedAppError(
      'INVALID_IPC_COMMAND',
      `Invalid IPC command: ${fieldName} must be a string or null.`
    )
  }

  return command[fieldName]
}

function readLockedWorktreeConfirmation(
  command: unknown
): { readonly lockReason: string | null } | undefined {
  if (!isRecord(command) || command.lockedWorktreeConfirmation === undefined) {
    return undefined
  }

  const confirmation = command.lockedWorktreeConfirmation
  if (
    !isRecord(confirmation) ||
    (typeof confirmation.lockReason !== 'string' && confirmation.lockReason !== null)
  ) {
    throw createExpectedAppError(
      'INVALID_IPC_COMMAND',
      'Invalid IPC command: lockedWorktreeConfirmation.lockReason must be a string or null.'
    )
  }

  return { lockReason: confirmation.lockReason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
