import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'

import { CreateTerminalBlockUseCase } from '../../contexts/block-graph/application/use-cases/CreateTerminalBlockUseCase'
import { DeleteBlockUseCase } from '../../contexts/block-graph/application/use-cases/DeleteBlockUseCase'
import { GetDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/GetDefaultGraphUseCase'
import { MoveBlockUseCase } from '../../contexts/block-graph/application/use-cases/MoveBlockUseCase'
import { ResizeTerminalBlockUseCase } from '../../contexts/block-graph/application/use-cases/ResizeTerminalBlockUseCase'
import { SaveDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/SaveDefaultGraphUseCase'
import { UpdateGraphViewportUseCase } from '../../contexts/block-graph/application/use-cases/UpdateGraphViewportUseCase'
import { UpdateTerminalBlockMetadataUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalBlockMetadataUseCase'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { FileSystemBlockGraphRepository } from '../../contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'
import { ArchiveBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase'
import { CheckoutMainWorkspaceBranchUseCase } from '../../contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'
import { CreateBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/CreateBranchWorkspaceUseCase'
import { CreateOrOpenProjectUseCase } from '../../contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import { ForgetProjectUseCase } from '../../contexts/project/application/use-cases/ForgetProjectUseCase'
import { ListGitBranchNavigationUseCase } from '../../contexts/project/application/use-cases/ListGitBranchNavigationUseCase'
import { ListRememberedProjectsUseCase } from '../../contexts/project/application/use-cases/ListRememberedProjectsUseCase'
import { RememberProjectUseCase } from '../../contexts/project/application/use-cases/RememberProjectUseCase'
import { SwitchBranchWorkspaceUseCase } from '../../contexts/project/application/use-cases/SwitchBranchWorkspaceUseCase'
import type { GitBranchNavigationItemSnapshot } from '../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import { FileSystemBranchWorkspaceDirectoryResolver } from '../../contexts/project/infrastructure/filesystem/FileSystemBranchWorkspaceDirectoryResolver'
import { FileSystemProjectRegistryRepository } from '../../contexts/project/infrastructure/filesystem/FileSystemProjectRegistryRepository'
import {
  FileSystemProjectRepository,
  inferProjectName
} from '../../contexts/project/infrastructure/filesystem/FileSystemProjectRepository'
import { GitCliWorkspaceAdapter } from '../../contexts/project/infrastructure/filesystem/GitCliWorkspaceAdapter'
import { TerminalSessionService } from '../../contexts/run/application/use-cases/TerminalSessionService'
import { NodePtyTerminalProcessAdapter } from '../../contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import { consoleLogger } from '../logging/ConsoleLogSink'
import { registerBlockGraphIpcHandlers } from './blockGraphIpcHandlers'
import { registerProjectIpcHandlers } from './projectIpcHandlers'
import { registerTerminalIpcHandlers } from './terminalIpcHandlers'

interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

const appStateDirectoryPath = getAppStateDirectoryPath()
const projectRepository = new FileSystemProjectRepository(appStateDirectoryPath)
const graphRepository = new FileSystemBlockGraphRepository(appStateDirectoryPath)
const gitWorkspaceAdapter = new GitCliWorkspaceAdapter()
const branchWorkspaceDirectoryResolver = new FileSystemBranchWorkspaceDirectoryResolver()
const createOrOpenProjectUseCase = new CreateOrOpenProjectUseCase(
  projectRepository,
  gitWorkspaceAdapter
)
const createBranchWorkspaceUseCase = new CreateBranchWorkspaceUseCase(
  projectRepository,
  gitWorkspaceAdapter,
  branchWorkspaceDirectoryResolver
)
const archiveBranchWorkspaceUseCase = new ArchiveBranchWorkspaceUseCase(
  projectRepository,
  gitWorkspaceAdapter
)
const switchBranchWorkspaceUseCase = new SwitchBranchWorkspaceUseCase(projectRepository)
const checkoutMainWorkspaceBranchUseCase = new CheckoutMainWorkspaceBranchUseCase(
  projectRepository,
  gitWorkspaceAdapter
)
const listGitBranchNavigationUseCase = new ListGitBranchNavigationUseCase(
  projectRepository,
  gitWorkspaceAdapter
)
const getDefaultGraphUseCase = new GetDefaultGraphUseCase(graphRepository)
const createTerminalBlockUseCase = new CreateTerminalBlockUseCase(graphRepository)
const moveBlockUseCase = new MoveBlockUseCase(graphRepository)
const resizeTerminalBlockUseCase = new ResizeTerminalBlockUseCase(graphRepository)
const deleteBlockUseCase = new DeleteBlockUseCase(graphRepository)
const saveDefaultGraphUseCase = new SaveDefaultGraphUseCase(graphRepository)
const updateGraphViewportUseCase = new UpdateGraphViewportUseCase(graphRepository)
const updateTerminalBlockMetadataUseCase = new UpdateTerminalBlockMetadataUseCase(graphRepository)
const terminalSessionService = new TerminalSessionService(new NodePtyTerminalProcessAdapter())
let projectRegistryRepository: FileSystemProjectRegistryRepository | null = null

const createMainWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'cleancode',
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

registerProjectIpcHandlers({
  archiveBranchWorkspace: (command) => archiveBranchWorkspaceUseCase.execute(command),
  checkoutMainWorkspaceBranch: (command) => checkoutMainWorkspaceBranchUseCase.execute(command),
  createBranchWorkspace: (command) => createBranchWorkspaceUseCase.execute(command),
  createOrOpenProject: (command) => createOrOpenProjectUseCase.execute(command),
  forgetProject: async (directory) => {
    await new ForgetProjectUseCase(getProjectRegistryRepository()).execute({ directory })
  },
  inferProjectName,
  ipcMain,
  loadRememberedWorkbenches,
  loadWorkbench,
  logger: consoleLogger,
  rememberProject,
  selectProjectDirectory,
  switchBranchWorkspace: (command) => switchBranchWorkspaceUseCase.execute(command)
})

registerBlockGraphIpcHandlers({
  createTerminalBlock: (command) => createTerminalBlockUseCase.execute(command),
  deleteBlock: (command) => deleteBlockUseCase.execute(command),
  ipcMain,
  logger: consoleLogger,
  moveBlock: (command) => moveBlockUseCase.execute(command),
  resizeTerminalBlock: (command) => resizeTerminalBlockUseCase.execute(command),
  saveGraph: (command) => saveDefaultGraphUseCase.execute(command),
  updateGraphViewport: (command) => updateGraphViewportUseCase.execute(command),
  updateTerminalBlockMetadata: (command) => updateTerminalBlockMetadataUseCase.execute(command)
})

registerTerminalIpcHandlers({
  interruptTerminal: (sessionId) => terminalSessionService.interrupt(sessionId),
  ipcMain,
  logger: consoleLogger,
  resizeTerminal: (sessionId, columns, rows) =>
    terminalSessionService.resize(sessionId, columns, rows),
  startTerminal: (command) => terminalSessionService.start(command),
  terminateTerminal: (sessionId) => terminalSessionService.terminate(sessionId),
  writeTerminal: (sessionId, input) => terminalSessionService.write(sessionId, input)
})

async function selectProjectDirectory(): Promise<string | null> {
  if (process.env.CLEANCODE_TEST_PROJECT_DIRECTORY) {
    return process.env.CLEANCODE_TEST_PROJECT_DIRECTORY
  }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function loadWorkbench(project: ProjectSnapshot): Promise<WorkbenchSnapshot> {
  const currentWorkspace = project.workspaces.find((workspace) => workspace.isCurrent)

  if (!currentWorkspace) {
    throw createExpectedAppError(
      'PROJECT_HAS_NO_CURRENT_WORKSPACE',
      'Project has no current branch workspace.'
    )
  }

  const graph = await getDefaultGraphUseCase.execute({
    projectId: project.id,
    projectDirectory: project.directory,
    workspaceName: currentWorkspace.name
  })
  const gitBranches = (
    await listGitBranchNavigationUseCase.execute({
      projectDirectory: project.directory
    })
  ).branches

  return { project, gitBranches, graph }
}

async function rememberProject(directory: string): Promise<void> {
  await new RememberProjectUseCase(getProjectRegistryRepository()).execute({ directory })
}

async function loadRememberedWorkbenches(): Promise<WorkbenchSnapshot[]> {
  const registry = await new ListRememberedProjectsUseCase(getProjectRegistryRepository()).execute()
  const workbenches: WorkbenchSnapshot[] = []

  for (const directory of registry.projectDirectories) {
    try {
      const rememberedProject = await projectRepository.findByDirectory(directory)

      if (rememberedProject) {
        const project = await createOrOpenProjectUseCase.execute({
          directory: rememberedProject.directory,
          name: rememberedProject.name
        })

        workbenches.push(await loadWorkbench(project))
      }
    } catch {
      // A remembered project may have been moved or corrupted outside cleancode.
    }
  }

  return workbenches
}

function getProjectRegistryRepository(): FileSystemProjectRegistryRepository {
  projectRegistryRepository ??= new FileSystemProjectRegistryRepository(getProjectRegistryPath())

  return projectRegistryRepository
}

function getProjectRegistryPath(): string {
  return (
    process.env.CLEANCODE_TEST_PROJECT_REGISTRY_PATH ??
    join(appStateDirectoryPath, 'project-registry.json')
  )
}

function getAppStateDirectoryPath(): string {
  return (
    process.env.CLEANCODE_TEST_APP_STATE_DIRECTORY ?? join(app.getPath('userData'), 'project-state')
  )
}

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  terminalSessionService.stopAll()
})
