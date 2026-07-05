import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'

import { CreateTerminalBlockUseCase } from '../../contexts/block-graph/application/use-cases/CreateTerminalBlockUseCase'
import { DeleteBlockUseCase } from '../../contexts/block-graph/application/use-cases/DeleteBlockUseCase'
import { GetDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/GetDefaultGraphUseCase'
import { MoveBlockUseCase } from '../../contexts/block-graph/application/use-cases/MoveBlockUseCase'
import { SaveDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/SaveDefaultGraphUseCase'
import { UpdateTerminalBlockMetadataUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalBlockMetadataUseCase'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { FileSystemBlockGraphRepository } from '../../contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'
import { CreateProjectUseCase } from '../../contexts/project/application/use-cases/CreateProjectUseCase'
import { ForgetProjectUseCase } from '../../contexts/project/application/use-cases/ForgetProjectUseCase'
import { ListRememberedProjectsUseCase } from '../../contexts/project/application/use-cases/ListRememberedProjectsUseCase'
import { RememberProjectUseCase } from '../../contexts/project/application/use-cases/RememberProjectUseCase'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import { FileSystemProjectRegistryRepository } from '../../contexts/project/infrastructure/filesystem/FileSystemProjectRegistryRepository'
import {
  FileSystemProjectRepository,
  inferProjectName
} from '../../contexts/project/infrastructure/filesystem/FileSystemProjectRepository'
import { TerminalSessionService } from '../../contexts/run/application/use-cases/TerminalSessionService'
import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import { NodePtyTerminalProcessAdapter } from '../../contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'

interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
  readonly graph: BlockGraphSnapshot
}

const appStateDirectoryPath = getAppStateDirectoryPath()
const projectRepository = new FileSystemProjectRepository(appStateDirectoryPath)
const graphRepository = new FileSystemBlockGraphRepository(appStateDirectoryPath)
const createProjectUseCase = new CreateProjectUseCase(projectRepository)
const getDefaultGraphUseCase = new GetDefaultGraphUseCase(graphRepository)
const createTerminalBlockUseCase = new CreateTerminalBlockUseCase(graphRepository)
const moveBlockUseCase = new MoveBlockUseCase(graphRepository)
const deleteBlockUseCase = new DeleteBlockUseCase(graphRepository)
const saveDefaultGraphUseCase = new SaveDefaultGraphUseCase(graphRepository)
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

ipcMain.handle('cleancode:add-project', async (): Promise<WorkbenchSnapshot | null> => {
  const projectDirectory = await selectProjectDirectory()

  if (!projectDirectory) {
    return null
  }

  const project =
    (await projectRepository.findByDirectory(projectDirectory)) ??
    (await createProjectUseCase.execute({
      directory: projectDirectory,
      name: inferProjectName(projectDirectory)
    }))

  await rememberProject(project.directory)

  return loadWorkbench(project)
})

ipcMain.handle('cleancode:list-workbenches', async (): Promise<WorkbenchSnapshot[]> => {
  return loadRememberedWorkbenches()
})

ipcMain.handle(
  'cleancode:remove-project',
  async (_event, command: { readonly projectDirectory: string }): Promise<WorkbenchSnapshot[]> => {
    await new ForgetProjectUseCase(getProjectRegistryRepository()).execute({
      directory: command.projectDirectory
    })

    return loadRememberedWorkbenches()
  }
)

ipcMain.handle(
  'cleancode:create-terminal-block',
  async (
    _event,
    command: {
      readonly projectDirectory: string
      readonly workspaceName: string
      readonly name: string
      readonly description: string
      readonly position: { readonly x: number; readonly y: number }
    }
  ): Promise<BlockGraphSnapshot> => {
    return createTerminalBlockUseCase.execute(command)
  }
)

ipcMain.handle(
  'cleancode:move-block',
  async (
    _event,
    command: {
      readonly projectDirectory: string
      readonly workspaceName: string
      readonly blockId: string
      readonly position: { readonly x: number; readonly y: number }
    }
  ): Promise<BlockGraphSnapshot> => {
    return moveBlockUseCase.execute(command)
  }
)

ipcMain.handle(
  'cleancode:update-terminal-block-metadata',
  async (
    _event,
    command: {
      readonly projectDirectory: string
      readonly workspaceName: string
      readonly blockId: string
      readonly name: string
      readonly description: string
    }
  ): Promise<BlockGraphSnapshot> => {
    return updateTerminalBlockMetadataUseCase.execute(command)
  }
)

ipcMain.handle(
  'cleancode:delete-block',
  async (
    _event,
    command: {
      readonly projectDirectory: string
      readonly workspaceName: string
      readonly blockId: string
    }
  ): Promise<BlockGraphSnapshot> => {
    return deleteBlockUseCase.execute(command)
  }
)

ipcMain.handle(
  'cleancode:save-graph',
  async (
    _event,
    command: {
      readonly projectDirectory: string
      readonly graph: BlockGraphSnapshot
    }
  ): Promise<BlockGraphSnapshot> => {
    return saveDefaultGraphUseCase.execute(command)
  }
)

ipcMain.handle(
  'cleancode:start-terminal',
  async (
    event,
    command: {
      readonly terminalBlockId: string
      readonly workspaceName: string
      readonly workingDirectory: string
      readonly shell?: string
      readonly columns?: number
      readonly rows?: number
    }
  ): Promise<TerminalSessionSnapshot> => {
    const sender = event.sender

    return terminalSessionService.start({
      terminalBlockId: command.terminalBlockId,
      workspaceName: command.workspaceName,
      workingDirectory: command.workingDirectory,
      shell: command.shell,
      columns: command.columns,
      rows: command.rows,
      onOutput: (outputEvent) => {
        if (!sender.isDestroyed()) {
          sender.send('cleancode:terminal-output', outputEvent)
        }
      },
      onExit: (exitEvent) => {
        if (!sender.isDestroyed()) {
          sender.send('cleancode:terminal-exit', exitEvent)
        }
      }
    })
  }
)

ipcMain.handle(
  'cleancode:resize-terminal',
  (
    _event,
    command: { readonly sessionId: string; readonly columns: number; readonly rows: number }
  ) => {
    terminalSessionService.resize(command.sessionId, command.columns, command.rows)
  }
)

ipcMain.handle(
  'cleancode:write-terminal',
  (
    _event,
    command: { readonly sessionId: string; readonly input: string }
  ): TerminalSessionSnapshot => {
    return terminalSessionService.write(command.sessionId, command.input)
  }
)

ipcMain.handle(
  'cleancode:interrupt-terminal',
  (_event, command: { readonly sessionId: string }): TerminalSessionSnapshot => {
    return terminalSessionService.interrupt(command.sessionId)
  }
)

ipcMain.handle(
  'cleancode:terminate-terminal',
  (_event, command: { readonly sessionId: string }): TerminalSessionSnapshot => {
    return terminalSessionService.terminate(command.sessionId)
  }
)

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
    throw new Error('Project has no current branch workspace.')
  }

  const graph = await getDefaultGraphUseCase.execute({
    projectId: project.id,
    projectDirectory: project.directory,
    workspaceName: currentWorkspace.name
  })

  return { project, graph }
}

async function rememberProject(directory: string): Promise<void> {
  await new RememberProjectUseCase(getProjectRegistryRepository()).execute({ directory })
}

async function loadRememberedWorkbenches(): Promise<WorkbenchSnapshot[]> {
  const registry = await new ListRememberedProjectsUseCase(getProjectRegistryRepository()).execute()
  const workbenches: WorkbenchSnapshot[] = []

  for (const directory of registry.projectDirectories) {
    try {
      const project = await projectRepository.findByDirectory(directory)

      if (project) {
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
