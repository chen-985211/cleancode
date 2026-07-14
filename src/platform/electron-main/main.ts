import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { CreateWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import { ExecuteAgentToolUseCase } from '../../contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { AgentSessionService } from '../../contexts/agent/application/use-cases/AgentSessionService'
import { InspectCodexCliUseCase } from '../../contexts/agent/application/use-cases/InspectCodexCliUseCase'
import { ListWorkspaceAgentsUseCase } from '../../contexts/agent/application/use-cases/ListWorkspaceAgentsUseCase'
import { RemoveWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/RemoveWorkspaceAgentUseCase'
import { RenameWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/RenameWorkspaceAgentUseCase'
import { UpdateWorkspaceAgentLayoutUseCase } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentLayoutUseCase'
import { UpdateWorkspaceAgentMcpCapabilityUseCase } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import { BlockGraphAgentToolAdapter } from '../../contexts/agent/infrastructure/block-graph/BlockGraphAgentToolAdapter'
import { NodeCodexCliAdapter } from '../../contexts/agent/infrastructure/cli/NodeCodexCliAdapter'
import { CleancodeMcpHttpServer } from '../../contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import { FileSystemAgentAuditRepository } from '../../contexts/agent/infrastructure/persistence/FileSystemAgentAuditRepository'
import { FileSystemAgentSessionRepository } from '../../contexts/agent/infrastructure/persistence/FileSystemAgentSessionRepository'
import { NodePtyCodexAgentProcessAdapter } from '../../contexts/agent/infrastructure/pty/NodePtyCodexAgentProcessAdapter'
import { AddTerminalToGroupUseCase } from '../../contexts/block-graph/application/use-cases/AddTerminalToGroupUseCase'
import { BuildTerminalWorkflowPlanUseCase } from '../../contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase'
import { ConnectTerminalBlocksUseCase } from '../../contexts/block-graph/application/use-cases/ConnectTerminalBlocksUseCase'
import { CreateTerminalBlockUseCase } from '../../contexts/block-graph/application/use-cases/CreateTerminalBlockUseCase'
import { CreateTerminalGroupUseCase } from '../../contexts/block-graph/application/use-cases/CreateTerminalGroupUseCase'
import { DeleteBlockUseCase } from '../../contexts/block-graph/application/use-cases/DeleteBlockUseCase'
import { DissolveTerminalGroupUseCase } from '../../contexts/block-graph/application/use-cases/DissolveTerminalGroupUseCase'
import { DisconnectTerminalBlocksUseCase } from '../../contexts/block-graph/application/use-cases/DisconnectTerminalBlocksUseCase'
import { GetDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/GetDefaultGraphUseCase'
import { MoveBlockUseCase } from '../../contexts/block-graph/application/use-cases/MoveBlockUseCase'
import { MoveTerminalGroupUseCase } from '../../contexts/block-graph/application/use-cases/MoveTerminalGroupUseCase'
import { RemoveTerminalFromGroupUseCase } from '../../contexts/block-graph/application/use-cases/RemoveTerminalFromGroupUseCase'
import { ResizeTerminalBlockUseCase } from '../../contexts/block-graph/application/use-cases/ResizeTerminalBlockUseCase'
import { SaveDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/SaveDefaultGraphUseCase'
import { SetTerminalGroupCollapsedUseCase } from '../../contexts/block-graph/application/use-cases/SetTerminalGroupCollapsedUseCase'
import { UpdateGraphViewportUseCase } from '../../contexts/block-graph/application/use-cases/UpdateGraphViewportUseCase'
import { UpdateTerminalGroupMetadataUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalGroupMetadataUseCase'
import { UpdateTerminalBlockMetadataUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalBlockMetadataUseCase'
import { UpdateTerminalExecutionConfigUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalExecutionConfigUseCase'
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
import { SynchronizeProjectGitStateUseCase } from '../../contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'
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
import { TerminalWorkflowService } from '../../contexts/run/application/use-cases/TerminalWorkflowService'
import { BlockGraphTerminalWorkflowPlanAdapter } from '../../contexts/run/infrastructure/block-graph/BlockGraphTerminalWorkflowPlanAdapter'
import { NodePtyTerminalProcessAdapter } from '../../contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { TerminalSessionWorkflowRuntimeAdapter } from '../../contexts/run/infrastructure/pty/TerminalSessionWorkflowRuntimeAdapter'
import { NodeTcpReadinessAdapter } from '../../contexts/run/infrastructure/readiness/NodeTcpReadinessAdapter'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import { consoleLogger } from '../logging/ConsoleLogSink'
import { registerAgentIpcHandlers } from './agentIpcHandlers'
import { createDisabledAgentSessionSnapshot } from './createDisabledAgentSessionSnapshot'
import { resolveAppIconPath } from './appIconPath'
import { registerBlockGraphIpcHandlers } from './blockGraphIpcHandlers'
import { registerProjectIpcHandlers } from './projectIpcHandlers'
import { registerTerminalIpcHandlers } from './terminalIpcHandlers'
import { registerTerminalWorkflowIpcHandlers } from './terminalWorkflowIpcHandlers'
import { resolveWindowFrameOptions } from './windowFrameOptions'

interface WorkbenchSnapshot {
  readonly agents: readonly WorkspaceAgentSnapshot[]
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
const listGitBranchNavigationUseCase = new ListGitBranchNavigationUseCase(
  projectRepository,
  gitWorkspaceAdapter
)
const synchronizeProjectGitStateUseCase = new SynchronizeProjectGitStateUseCase(
  projectRepository,
  gitWorkspaceAdapter
)
const getDefaultGraphUseCase = new GetDefaultGraphUseCase(graphRepository)
const createTerminalBlockUseCase = new CreateTerminalBlockUseCase(graphRepository)
const createTerminalGroupUseCase = new CreateTerminalGroupUseCase(graphRepository)
const connectTerminalBlocksUseCase = new ConnectTerminalBlocksUseCase(graphRepository)
const disconnectTerminalBlocksUseCase = new DisconnectTerminalBlocksUseCase(graphRepository)
const moveBlockUseCase = new MoveBlockUseCase(graphRepository)
const moveTerminalGroupUseCase = new MoveTerminalGroupUseCase(graphRepository)
const addTerminalToGroupUseCase = new AddTerminalToGroupUseCase(graphRepository)
const removeTerminalFromGroupUseCase = new RemoveTerminalFromGroupUseCase(graphRepository)
const dissolveTerminalGroupUseCase = new DissolveTerminalGroupUseCase(graphRepository)
const resizeTerminalBlockUseCase = new ResizeTerminalBlockUseCase(graphRepository)
const deleteBlockUseCase = new DeleteBlockUseCase(graphRepository)
const saveDefaultGraphUseCase = new SaveDefaultGraphUseCase(graphRepository)
const setTerminalGroupCollapsedUseCase = new SetTerminalGroupCollapsedUseCase(graphRepository)
const updateGraphViewportUseCase = new UpdateGraphViewportUseCase(graphRepository)
const updateTerminalGroupMetadataUseCase = new UpdateTerminalGroupMetadataUseCase(graphRepository)
const updateTerminalBlockMetadataUseCase = new UpdateTerminalBlockMetadataUseCase(graphRepository)
const updateTerminalExecutionConfigUseCase = new UpdateTerminalExecutionConfigUseCase(
  graphRepository
)
const terminalSessionService = new TerminalSessionService(new NodePtyTerminalProcessAdapter())
const terminalWorkflowService = new TerminalWorkflowService(
  new BlockGraphTerminalWorkflowPlanAdapter(new BuildTerminalWorkflowPlanUseCase(graphRepository)),
  new TerminalSessionWorkflowRuntimeAdapter(terminalSessionService),
  new NodeTcpReadinessAdapter(),
  {
    publish: (event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('cleancode:terminal-workflow-event', event)
        }
      }
    }
  }
)
const codexCliAdapter = new NodeCodexCliAdapter()
const inspectCodexCliUseCase = new InspectCodexCliUseCase(codexCliAdapter)
const agentAuditRepository = new FileSystemAgentAuditRepository(
  join(appStateDirectoryPath, 'agent-audit.jsonl')
)
const agentSessionRepository = new FileSystemAgentSessionRepository(
  join(appStateDirectoryPath, 'agent-sessions.json')
)
const listWorkspaceAgentsUseCase = new ListWorkspaceAgentsUseCase(agentSessionRepository)
const createWorkspaceAgentUseCase = new CreateWorkspaceAgentUseCase(agentSessionRepository)
const renameWorkspaceAgentUseCase = new RenameWorkspaceAgentUseCase(agentSessionRepository)
const updateWorkspaceAgentLayoutUseCase = new UpdateWorkspaceAgentLayoutUseCase(
  agentSessionRepository
)
const agentBlockGraphToolAdapter = new BlockGraphAgentToolAdapter({
  createTerminalBlock: (command) => createTerminalBlockUseCase.execute(command),
  createTerminalGroup: (command) => createTerminalGroupUseCase.execute(command),
  deleteBlock: (command) => deleteBlockUseCase.execute(command),
  dissolveTerminalGroup: (command) => dissolveTerminalGroupUseCase.execute(command),
  getDefaultGraph: getDefaultGraphForAgent,
  moveBlock: (command) => moveBlockUseCase.execute(command),
  moveTerminalGroup: (command) => moveTerminalGroupUseCase.execute(command),
  resizeTerminalBlock: (command) => resizeTerminalBlockUseCase.execute(command),
  setTerminalGroupCollapsed: (command) => setTerminalGroupCollapsedUseCase.execute(command),
  updateTerminalBlockMetadata: (command) => updateTerminalBlockMetadataUseCase.execute(command),
  updateTerminalGroupMetadata: (command) => updateTerminalGroupMetadataUseCase.execute(command)
})
const executeAgentToolUseCase = new ExecuteAgentToolUseCase(
  agentBlockGraphToolAdapter,
  agentAuditRepository
)
const agentSessionService = new AgentSessionService(
  new NodePtyCodexAgentProcessAdapter(),
  new CleancodeMcpHttpServer(),
  (command) => executeAgentToolUseCase.execute(command),
  agentSessionRepository
)
const updateWorkspaceAgentMcpCapabilityUseCase = new UpdateWorkspaceAgentMcpCapabilityUseCase(
  agentSessionRepository,
  agentSessionService
)
const removeWorkspaceAgentUseCase = new RemoveWorkspaceAgentUseCase(
  agentSessionRepository,
  agentSessionService
)
const checkoutMainWorkspaceBranchUseCase = new CheckoutMainWorkspaceBranchUseCase(
  projectRepository,
  gitWorkspaceAdapter,
  {
    resume: (workspaceDirectory) =>
      agentSessionService.resumeWorkspaceDirectory(workspaceDirectory),
    suspend: (workspaceDirectory) =>
      agentSessionService.suspendWorkspaceDirectory(workspaceDirectory)
  }
)
const isAgentAutostartDisabledForTest = process.env.CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART === '1'
let projectRegistryRepository: FileSystemProjectRegistryRepository | null = null

const createMainWindow = (appIconPath: string | undefined): void => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'cleancode',
    backgroundColor: '#f7f8fa',
    icon: appIconPath,
    ...resolveWindowFrameOptions(process.platform),
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
  switchBranchWorkspace: (command) => switchBranchWorkspaceUseCase.execute(command),
  synchronizeProjectGitState: (command) => synchronizeProjectGitStateUseCase.execute(command)
})

registerBlockGraphIpcHandlers({
  addTerminalToGroup: (command) => addTerminalToGroupUseCase.execute(command),
  createTerminalBlock: (command) => createTerminalBlockUseCase.execute(command),
  createTerminalGroup: (command) => createTerminalGroupUseCase.execute(command),
  connectTerminalBlocks: (command) => connectTerminalBlocksUseCase.execute(command),
  deleteBlock: (command) => deleteBlockUseCase.execute(command),
  dissolveTerminalGroup: (command) => dissolveTerminalGroupUseCase.execute(command),
  disconnectTerminalBlocks: (command) => disconnectTerminalBlocksUseCase.execute(command),
  ipcMain,
  logger: consoleLogger,
  moveBlock: (command) => moveBlockUseCase.execute(command),
  moveTerminalGroup: (command) => moveTerminalGroupUseCase.execute(command),
  removeTerminalFromGroup: (command) => removeTerminalFromGroupUseCase.execute(command),
  resizeTerminalBlock: (command) => resizeTerminalBlockUseCase.execute(command),
  saveGraph: (command) => saveDefaultGraphUseCase.execute(command),
  setTerminalGroupCollapsed: (command) => setTerminalGroupCollapsedUseCase.execute(command),
  updateGraphViewport: (command) => updateGraphViewportUseCase.execute(command),
  updateTerminalGroupMetadata: (command) => updateTerminalGroupMetadataUseCase.execute(command),
  updateTerminalBlockMetadata: (command) => updateTerminalBlockMetadataUseCase.execute(command),
  updateTerminalExecutionConfig: (command) => updateTerminalExecutionConfigUseCase.execute(command)
})

registerTerminalIpcHandlers({
  interruptTerminal: (sessionId) => terminalSessionService.interrupt(sessionId),
  ipcMain,
  listTerminalWorkingDirectories: (sessionIds) =>
    terminalSessionService.listWorkingDirectories(sessionIds),
  logger: consoleLogger,
  resizeTerminal: (sessionId, columns, rows) =>
    terminalSessionService.resize(sessionId, columns, rows),
  startTerminal: (command) => terminalSessionService.start(command),
  terminateTerminal: (sessionId) => terminalSessionService.terminate(sessionId),
  writeTerminal: (sessionId, input) => terminalSessionService.write(sessionId, input)
})

registerTerminalWorkflowIpcHandlers({
  ipcMain,
  logger: consoleLogger,
  workflowService: terminalWorkflowService
})

registerAgentIpcHandlers({
  approveAgentTool: (approvalId) => agentSessionService.approveTool({ approvalId }),
  attachAgentSession: (command) =>
    isAgentAutostartDisabledForTest
      ? Promise.resolve(createDisabledAgentSessionSnapshot(command))
      : agentSessionService.attach(command),
  createWorkspaceAgent: (command) => createWorkspaceAgentUseCase.execute(command),
  disposeAgentWorkspaceSession: (command) =>
    isAgentAutostartDisabledForTest
      ? Promise.resolve()
      : agentSessionService.disposeSession(command),
  disposeProjectAgentSessions: (projectDirectory) =>
    isAgentAutostartDisabledForTest
      ? Promise.resolve()
      : agentSessionService.disposeProject(projectDirectory),
  inspectCodexCli: () => inspectCodexCliUseCase.execute(),
  ipcMain,
  logger: consoleLogger,
  rejectAgentTool: (approvalId) => agentSessionService.rejectTool({ approvalId }),
  removeWorkspaceAgent: (command) => removeWorkspaceAgentUseCase.execute(command),
  renameWorkspaceAgent: (command) => renameWorkspaceAgentUseCase.execute(command),
  resizeAgentSession: (sessionId, columns, rows) => {
    if (!isAgentAutostartDisabledForTest) {
      agentSessionService.resize({ columns, rows, sessionId })
    }
  },
  writeAgentSession: (sessionId, input) => {
    if (!isAgentAutostartDisabledForTest) {
      agentSessionService.write({ input, sessionId })
    }
  },
  updateWorkspaceAgentLayout: (command) => updateWorkspaceAgentLayoutUseCase.execute(command),
  updateWorkspaceAgentMcpCapability: (command) =>
    updateWorkspaceAgentMcpCapabilityUseCase.execute(command)
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
  const agents = await listWorkspaceAgentsUseCase.execute({
    projectId: project.id,
    workspaceName: currentWorkspace.name
  })
  const gitBranches = (
    await listGitBranchNavigationUseCase.execute({
      projectDirectory: project.directory
    })
  ).branches

  return { agents, project, gitBranches, graph }
}

async function getDefaultGraphForAgent(command: {
  readonly projectDirectory: string
  readonly workspaceName: string
}): Promise<BlockGraphSnapshot> {
  const project = await projectRepository.findByDirectory(command.projectDirectory)

  return getDefaultGraphUseCase.execute({
    projectDirectory: command.projectDirectory,
    projectId: project?.id ?? command.projectDirectory,
    workspaceName: command.workspaceName
  })
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
  const appIconPath = resolveAppIconPath({
    fileExists: existsSync,
    isDevelopment: Boolean(process.env.ELECTRON_RENDERER_URL),
    mainDirectory: __dirname,
    projectDirectory: process.cwd()
  })

  if (process.platform === 'darwin' && appIconPath) {
    app.dock?.setIcon(appIconPath)
  }

  createMainWindow(appIconPath)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(appIconPath)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let isReadyToQuit = false
let isPreparingToQuit = false

app.on('before-quit', (event) => {
  if (isReadyToQuit) {
    return
  }

  event.preventDefault()
  if (isPreparingToQuit) {
    return
  }

  isPreparingToQuit = true
  terminalSessionService.stopAll()
  void agentSessionService.disposeAll().finally(() => {
    isReadyToQuit = true
    app.quit()
  })
})
