import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { CreateWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import { DiscoverCreatableAgentProvidersUseCase } from '../../contexts/agent/application/use-cases/DiscoverCreatableAgentProvidersUseCase'
import { ExecuteAgentToolUseCase } from '../../contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { AgentSessionService } from '../../contexts/agent/application/use-cases/AgentSessionService'
import { AgentProviderAvailabilityService } from '../../contexts/agent/application/services/AgentProviderAvailabilityService'
import { AgentProviderRegistry } from '../../contexts/agent/application/services/AgentProviderRegistry'
import { AgentWorkspaceTransactionCoordinator } from '../../contexts/agent/application/services/AgentWorkspaceTransactionCoordinator'
import { InspectAgentProviderUseCase } from '../../contexts/agent/application/use-cases/InspectAgentProviderUseCase'
import { ListAgentProvidersUseCase } from '../../contexts/agent/application/use-cases/ListAgentProvidersUseCase'
import { ListWorkspaceAgentsUseCase } from '../../contexts/agent/application/use-cases/ListWorkspaceAgentsUseCase'
import { GetAgentProviderPreferencesUseCase } from '../../contexts/agent/application/use-cases/GetAgentProviderPreferencesUseCase'
import { RemoveWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/RemoveWorkspaceAgentUseCase'
import { RenameWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/RenameWorkspaceAgentUseCase'
import { UpdateAgentProviderPreferencesUseCase } from '../../contexts/agent/application/use-cases/UpdateAgentProviderPreferencesUseCase'
import { UpdateWorkspaceAgentLayoutUseCase } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentLayoutUseCase'
import { UpdateWorkspaceAgentMcpCapabilityUseCase } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import { BlockGraphAgentToolAdapter } from '../../contexts/agent/infrastructure/block-graph/BlockGraphAgentToolAdapter'
import { CleancodeMcpHttpServer } from '../../contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import { FileSystemAgentAuditRepository } from '../../contexts/agent/infrastructure/persistence/FileSystemAgentAuditRepository'
import { FileSystemAgentProviderPreferencesRepository } from '../../contexts/agent/infrastructure/persistence/FileSystemAgentProviderPreferencesRepository'
import { FileSystemAgentSessionRepository } from '../../contexts/agent/infrastructure/persistence/FileSystemAgentSessionRepository'
import { createBuiltinAgentProviderContributions } from '../../contexts/agent/infrastructure/providers/catalog/BuiltinAgentProviderCatalog'
import { NodeAgentProviderShellPathHydrator } from '../../contexts/agent/infrastructure/providers/shared/NodeAgentProviderShellPathHydrator'
import { RunAgentTerminalRuntimeAdapter } from '../../contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter'
import { AddQuickExecutionTargetUseCase } from '../../contexts/block-graph/application/use-cases/AddQuickExecutionTargetUseCase'
import { ArrangeTerminalLayoutUseCase } from '../../contexts/block-graph/application/use-cases/ArrangeTerminalLayoutUseCase'
import { BindQuickExecutionSlotUseCase } from '../../contexts/block-graph/application/use-cases/BindQuickExecutionSlotUseCase'
import { BuildTerminalWorkflowPlanUseCase } from '../../contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase'
import { ConnectTerminalBlocksUseCase } from '../../contexts/block-graph/application/use-cases/ConnectTerminalBlocksUseCase'
import { CreateTerminalBlockUseCase } from '../../contexts/block-graph/application/use-cases/CreateTerminalBlockUseCase'
import { CreateTerminalGroupUseCase } from '../../contexts/block-graph/application/use-cases/CreateTerminalGroupUseCase'
import { CreateTerminalWorkflowUseCase } from '../../contexts/block-graph/application/use-cases/CreateTerminalWorkflowUseCase'
import { ClearQuickExecutionSlotUseCase } from '../../contexts/block-graph/application/use-cases/ClearQuickExecutionSlotUseCase'
import { ReorderQuickExecutionSlotsUseCase } from '../../contexts/block-graph/application/use-cases/ReorderQuickExecutionSlotsUseCase'
import { DeleteBlockUseCase } from '../../contexts/block-graph/application/use-cases/DeleteBlockUseCase'
import { DeleteTerminalScopeUseCase } from '../../contexts/block-graph/application/use-cases/DeleteTerminalScopeUseCase'
import { DeleteBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/DeleteBlockTemplateUseCase'
import { DissolveTerminalGroupUseCase } from '../../contexts/block-graph/application/use-cases/DissolveTerminalGroupUseCase'
import { DisconnectTerminalBlocksUseCase } from '../../contexts/block-graph/application/use-cases/DisconnectTerminalBlocksUseCase'
import { GetDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/GetDefaultGraphUseCase'
import { GetTerminalLaunchPlanUseCase } from '../../contexts/block-graph/application/use-cases/GetTerminalLaunchPlanUseCase'
import { InstantiateBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase'
import { ListBlockTemplatesUseCase } from '../../contexts/block-graph/application/use-cases/ListBlockTemplatesUseCase'
import { MoveBlockUseCase } from '../../contexts/block-graph/application/use-cases/MoveBlockUseCase'
import { MoveBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/MoveBlockTemplateUseCase'
import { MoveTerminalGroupUseCase } from '../../contexts/block-graph/application/use-cases/MoveTerminalGroupUseCase'
import { MoveTerminalWorkflowToGroupUseCase } from '../../contexts/block-graph/application/use-cases/MoveTerminalWorkflowToGroupUseCase'
import { ResizeTerminalBlockUseCase } from '../../contexts/block-graph/application/use-cases/ResizeTerminalBlockUseCase'
import { SaveBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/SaveBlockTemplateUseCase'
import { SetTerminalGroupCollapsedUseCase } from '../../contexts/block-graph/application/use-cases/SetTerminalGroupCollapsedUseCase'
import { UpdateGraphViewportUseCase } from '../../contexts/block-graph/application/use-cases/UpdateGraphViewportUseCase'
import { UpdateBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/UpdateBlockTemplateUseCase'
import { UpdateTerminalGroupMetadataUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalGroupMetadataUseCase'
import { UpdateTerminalBlockMetadataUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalBlockMetadataUseCase'
import { UpdateTerminalExecutionConfigUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalExecutionConfigUseCase'
import { UpdateTerminalDefinitionUseCase } from '../../contexts/block-graph/application/use-cases/UpdateTerminalDefinitionUseCase'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { FileSystemBlockGraphRepository } from '../../contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'
import { FileSystemBlockTemplateRepository } from '../../contexts/block-graph/infrastructure/filesystem/FileSystemBlockTemplateRepository'
import { ListGitBranchNavigationUseCase } from '../../contexts/project/application/use-cases/ListGitBranchNavigationUseCase'
import { ListRememberedProjectsUseCase } from '../../contexts/project/application/use-cases/ListRememberedProjectsUseCase'
import { ProjectWorkspaceTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { ValidateProjectWorkspaceScopeUseCase } from '../../contexts/project/application/use-cases/ValidateProjectWorkspaceScopeUseCase'
import type { GitBranchNavigationItemSnapshot } from '../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import { FileSystemBranchWorkspaceDirectoryResolver } from '../../contexts/project/infrastructure/filesystem/FileSystemBranchWorkspaceDirectoryResolver'
import { FileSystemProjectRegistryRepository } from '../../contexts/project/infrastructure/filesystem/FileSystemProjectRegistryRepository'
import {
  FileSystemProjectRepository,
  inferProjectName
} from '../../contexts/project/infrastructure/filesystem/FileSystemProjectRepository'
import { GitCliWorkspaceAdapter } from '../../contexts/project/infrastructure/filesystem/GitCliWorkspaceAdapter'
import { BlockGraphTerminalLaunchPlanAdapter } from '../../contexts/run/infrastructure/block-graph/BlockGraphTerminalLaunchPlanAdapter'
import { BlockGraphTerminalWorkflowPlanAdapter } from '../../contexts/run/infrastructure/block-graph/BlockGraphTerminalWorkflowPlanAdapter'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import { consoleLogger } from '../logging/ConsoleLogSink'
import { registerAgentIpcHandlers } from './agentIpcHandlers'
import { createAgentLifecycle, disposeRuntime } from './agentRuntimeLifecycleAdapter'
import { createAgentRuntimeScopeValidation } from './agentRuntimeScopeValidationAdapter'
import { AgentWorkspaceCreationScopeAdapter } from './agentWorkspaceCreationScopeAdapter'
import { createProjectLifecycleUseCases } from './projectLifecycleUseCases'
import { createRunRuntimeScopeValidation } from './runRuntimeScopeValidationAdapter'
import { createRunRuntime } from './runRuntimeComposition'
import { createDisabledAgentSessionSnapshot } from './createDisabledAgentSessionSnapshot'
import { createMainWindow } from './createMainWindow'
import { resolveElectronWindowPolicy } from './electronWindowPolicy'
import { resolveAppIconPath } from './appIconPath'
import { registerBlockGraphIpcHandlers } from './blockGraphIpcHandlers'
import { registerBlockTemplateIpcHandlers } from './blockTemplateIpcHandlers'
import { registerProjectIpcHandlers } from './projectIpcHandlers'
import { registerTerminalIpcHandlers } from './terminalIpcHandlers'
import { registerTerminalWorkflowIpcHandlers } from './terminalWorkflowIpcHandlers'
import { loadRememberedWorkbenchList } from './loadRememberedWorkbenchList'
import { createManagedServiceOwnerResolver } from './managedServiceOwnerResolver'
import { createApplicationRuntimeShutdownCoordinator } from './applicationRuntimeShutdown'
import { registerWindowFullScreenStateIpc } from './windowFullScreenState'
import { configureElectronRuntimeDataDirectories } from './runtimeDataDirectoryBootstrap'
import { shouldAcquireSingleInstanceLock } from './singleInstancePolicy'

interface WorkbenchSnapshot {
  readonly agents: readonly WorkspaceAgentSnapshot[]
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

configureElectronRuntimeDataDirectories(app)

const acquiresSingleInstanceLock = shouldAcquireSingleInstanceLock(process.env)
const isPrimaryAppInstance = !acquiresSingleInstanceLock || app.requestSingleInstanceLock()
if (!isPrimaryAppInstance) app.quit()

if (acquiresSingleInstanceLock) {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
}

const appStateDirectoryPath = getAppStateDirectoryPath()
consoleLogger.configureFile(join(appStateDirectoryPath, 'logs', 'main.log'))
const projectRepository = new FileSystemProjectRepository(appStateDirectoryPath)
let projectRegistryRepository: FileSystemProjectRegistryRepository | null = null
const graphRepository = new FileSystemBlockGraphRepository(appStateDirectoryPath)
const blockTemplateRepository = new FileSystemBlockTemplateRepository(
  join(appStateDirectoryPath, 'block-template-library.json')
)
const resolveManagedServiceOwner = createManagedServiceOwnerResolver(
  projectRepository,
  graphRepository
)
const gitWorkspaceAdapter = new GitCliWorkspaceAdapter()
const branchWorkspaceDirectoryResolver = new FileSystemBranchWorkspaceDirectoryResolver()
const listGitBranchNavigationUseCase = new ListGitBranchNavigationUseCase(
  projectRepository,
  gitWorkspaceAdapter
)
const getDefaultGraphUseCase = new GetDefaultGraphUseCase(graphRepository)
const arrangeTerminalLayoutUseCase = new ArrangeTerminalLayoutUseCase(graphRepository)
const createTerminalBlockUseCase = new CreateTerminalBlockUseCase(graphRepository)
const createTerminalGroupUseCase = new CreateTerminalGroupUseCase(graphRepository)
const createTerminalWorkflowUseCase = new CreateTerminalWorkflowUseCase(graphRepository)
const addQuickExecutionTargetUseCase = new AddQuickExecutionTargetUseCase(graphRepository)
const bindQuickExecutionSlotUseCase = new BindQuickExecutionSlotUseCase(graphRepository)
const clearQuickExecutionSlotUseCase = new ClearQuickExecutionSlotUseCase(graphRepository)
const reorderQuickExecutionSlotsUseCase = new ReorderQuickExecutionSlotsUseCase(graphRepository)
const connectTerminalBlocksUseCase = new ConnectTerminalBlocksUseCase(graphRepository)
const disconnectTerminalBlocksUseCase = new DisconnectTerminalBlocksUseCase(graphRepository)
const moveBlockUseCase = new MoveBlockUseCase(graphRepository)
const moveTerminalGroupUseCase = new MoveTerminalGroupUseCase(graphRepository)
const moveTerminalWorkflowToGroupUseCase = new MoveTerminalWorkflowToGroupUseCase(graphRepository)
const dissolveTerminalGroupUseCase = new DissolveTerminalGroupUseCase(graphRepository)
const resizeTerminalBlockUseCase = new ResizeTerminalBlockUseCase(graphRepository)
const setTerminalGroupCollapsedUseCase = new SetTerminalGroupCollapsedUseCase(graphRepository)
const updateGraphViewportUseCase = new UpdateGraphViewportUseCase(graphRepository)
const updateTerminalGroupMetadataUseCase = new UpdateTerminalGroupMetadataUseCase(graphRepository)
const updateTerminalBlockMetadataUseCase = new UpdateTerminalBlockMetadataUseCase(graphRepository)
const updateTerminalExecutionConfigUseCase = new UpdateTerminalExecutionConfigUseCase(
  graphRepository
)
const updateTerminalDefinitionUseCase = new UpdateTerminalDefinitionUseCase(graphRepository)
const listBlockTemplatesUseCase = new ListBlockTemplatesUseCase(blockTemplateRepository)
const saveBlockTemplateUseCase = new SaveBlockTemplateUseCase(
  graphRepository,
  blockTemplateRepository
)
const updateBlockTemplateUseCase = new UpdateBlockTemplateUseCase(blockTemplateRepository)
const moveBlockTemplateUseCase = new MoveBlockTemplateUseCase(blockTemplateRepository)
const deleteBlockTemplateUseCase = new DeleteBlockTemplateUseCase(blockTemplateRepository)
const instantiateBlockTemplateUseCase = new InstantiateBlockTemplateUseCase(
  graphRepository,
  blockTemplateRepository
)
const buildTerminalWorkflowPlanUseCase = new BuildTerminalWorkflowPlanUseCase(graphRepository)
const getTerminalLaunchPlanUseCase = new GetTerminalLaunchPlanUseCase(graphRepository)
const {
  getRuntimeAvailability: getTerminalRuntimeAvailability,
  initialize: initializeRunRuntime,
  launchTerminal,
  lifecycle: runLifecycleService,
  openTerminalServiceEndpoint,
  openTerminalLink,
  retryInitialize: retryTerminalRuntime,
  sessions: terminalSessionService,
  terminalRuns,
  managedServices: terminalManagedServices,
  workflow: terminalWorkflowService,
  workspaceRuns
} = createRunRuntime({
  appStateDirectory: appStateDirectoryPath,
  launchPlans: new BlockGraphTerminalLaunchPlanAdapter(getTerminalLaunchPlanUseCase),
  resolveManagedServiceOwner,
  scopeValidation: createRunRuntimeScopeValidation(
    getProjectRegistryRepository(),
    projectRepository
  ),
  workflowPlans: new BlockGraphTerminalWorkflowPlanAdapter(buildTerminalWorkflowPlanUseCase)
})
const deleteBlockUseCase = new DeleteBlockUseCase(graphRepository, terminalRuns)
const deleteTerminalScopeUseCase = new DeleteTerminalScopeUseCase(graphRepository, terminalRuns)
const defaultAgentProviderId = 'codex'
const agentProviderRegistry = new AgentProviderRegistry(createBuiltinAgentProviderContributions())
const agentProviderPreferencesRepository = new FileSystemAgentProviderPreferencesRepository(
  join(appStateDirectoryPath, 'agent-provider-preferences.json')
)
const getAgentProviderPreferencesUseCase = new GetAgentProviderPreferencesUseCase(
  agentProviderPreferencesRepository
)
const updateAgentProviderPreferencesUseCase = new UpdateAgentProviderPreferencesUseCase(
  agentProviderPreferencesRepository,
  agentProviderRegistry
)
const agentProviderAvailability = new AgentProviderAvailabilityService(
  agentProviderRegistry,
  new NodeAgentProviderShellPathHydrator()
)
const discoverCreatableAgentProvidersUseCase = new DiscoverCreatableAgentProvidersUseCase(
  agentProviderAvailability
)
const inspectAgentProviderUseCase = new InspectAgentProviderUseCase(agentProviderAvailability)
const listAgentProvidersUseCase = new ListAgentProvidersUseCase(agentProviderRegistry)
const agentAuditRepository = new FileSystemAgentAuditRepository(
  join(appStateDirectoryPath, 'agent-audit.jsonl')
)
const agentSessionRepository = new FileSystemAgentSessionRepository(
  join(appStateDirectoryPath, 'agent-sessions.json'),
  agentProviderRegistry
)
const agentWorkspaceTransactions = new AgentWorkspaceTransactionCoordinator()
const projectWorkspaceTransactions = new ProjectWorkspaceTransactionCoordinator()
const agentWorkspaceCreationScope = new AgentWorkspaceCreationScopeAdapter(
  new ValidateProjectWorkspaceScopeUseCase(projectRepository, getProjectRegistryRepository()),
  projectWorkspaceTransactions
)
const listWorkspaceAgentsUseCase = new ListWorkspaceAgentsUseCase(
  agentSessionRepository,
  agentWorkspaceTransactions
)
const createWorkspaceAgentUseCase = new CreateWorkspaceAgentUseCase(
  agentSessionRepository,
  agentProviderRegistry,
  agentProviderAvailability,
  agentWorkspaceTransactions,
  agentWorkspaceCreationScope,
  agentProviderPreferencesRepository
)
const renameWorkspaceAgentUseCase = new RenameWorkspaceAgentUseCase(agentSessionRepository)
const updateWorkspaceAgentLayoutUseCase = new UpdateWorkspaceAgentLayoutUseCase(
  agentSessionRepository
)
const agentBlockGraphToolAdapter = new BlockGraphAgentToolAdapter({
  arrangeTerminalLayout: (command) => arrangeTerminalLayoutUseCase.execute(command),
  buildTerminalWorkflowPlan: (query) => buildTerminalWorkflowPlanUseCase.execute(query),
  connectTerminalBlocks: (command) => connectTerminalBlocksUseCase.execute(command),
  createTerminalBlock: (command) => createTerminalBlockUseCase.execute(command),
  createTerminalGroup: (command) => createTerminalGroupUseCase.execute(command),
  createTerminalWorkflow: (command) => createTerminalWorkflowUseCase.execute(command),
  deleteBlock: (command) => deleteBlockUseCase.execute(command),
  dissolveTerminalGroup: (command) => dissolveTerminalGroupUseCase.execute(command),
  disconnectTerminalBlocks: (command) => disconnectTerminalBlocksUseCase.execute(command),
  getDefaultGraph: getDefaultGraphForAgent,
  moveBlock: (command) => moveBlockUseCase.execute(command),
  moveTerminalGroup: (command) => moveTerminalGroupUseCase.execute(command),
  resizeTerminalBlock: (command) => resizeTerminalBlockUseCase.execute(command),
  setTerminalGroupCollapsed: (command) => setTerminalGroupCollapsedUseCase.execute(command),
  updateTerminalBlockMetadata: (command) => updateTerminalBlockMetadataUseCase.execute(command),
  updateTerminalExecutionConfig: (command) => updateTerminalExecutionConfigUseCase.execute(command),
  updateTerminalGroupMetadata: (command) => updateTerminalGroupMetadataUseCase.execute(command)
})
const executeAgentToolUseCase = new ExecuteAgentToolUseCase(
  agentBlockGraphToolAdapter,
  agentAuditRepository,
  agentSessionRepository
)
const agentSessionService = new AgentSessionService(
  new RunAgentTerminalRuntimeAdapter(terminalSessionService),
  new CleancodeMcpHttpServer(),
  executeAgentToolUseCase,
  agentSessionRepository,
  agentProviderRegistry,
  defaultAgentProviderId,
  createAgentRuntimeScopeValidation(
    agentSessionRepository,
    getProjectRegistryRepository(),
    projectRepository
  ),
  agentProviderAvailability,
  agentProviderPreferencesRepository
)
const workspaceAgentLifecycleAdapter = createAgentLifecycle(agentSessionService)
const {
  archiveBranchWorkspaceUseCase,
  checkoutMainWorkspaceBranchUseCase,
  createBranchWorkspaceUseCase,
  createOrOpenProjectUseCase,
  forgetProjectUseCase,
  rememberProjectUseCase,
  reorderProjectsUseCase,
  selectCurrentProjectUseCase,
  switchBranchWorkspaceUseCase,
  synchronizeProjectGitStateUseCase
} = createProjectLifecycleUseCases({
  agentLifecycle: workspaceAgentLifecycleAdapter,
  runLifecycle: workspaceRuns,
  branchDirectories: branchWorkspaceDirectoryResolver,
  gitWorkspace: gitWorkspaceAdapter,
  projectRegistry: getProjectRegistryRepository(),
  projects: projectRepository,
  workspaceTransactions: projectWorkspaceTransactions
})
const updateWorkspaceAgentMcpCapabilityUseCase = new UpdateWorkspaceAgentMcpCapabilityUseCase(
  agentSessionRepository,
  agentSessionService,
  agentProviderRegistry
)
const removeWorkspaceAgentUseCase = new RemoveWorkspaceAgentUseCase(
  agentSessionRepository,
  agentSessionService
)
const isAgentAutostartDisabledForTest = process.env.CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART === '1'
const electronWindowPolicy = resolveElectronWindowPolicy({
  backgroundE2eMarker: process.env.CLEANCODE_TEST_BACKGROUND_E2E
})
registerWindowFullScreenStateIpc({
  ipcMain,
  logger: consoleLogger,
  resolveWindow: (event) => BrowserWindow.fromWebContents((event as IpcMainInvokeEvent).sender)
})
registerProjectIpcHandlers({
  archiveBranchWorkspace: (command) => archiveBranchWorkspaceUseCase.execute(command),
  checkoutMainWorkspaceBranch: (command) => checkoutMainWorkspaceBranchUseCase.execute(command),
  createBranchWorkspace: (command) => createBranchWorkspaceUseCase.execute(command),
  createOrOpenProject: (command) => createOrOpenProjectUseCase.execute(command),
  forgetProject: (directory) => forgetProjectUseCase.execute({ directory }),
  inferProjectName,
  ipcMain,
  loadRememberedWorkbenches,
  loadWorkbench,
  logger: consoleLogger,
  rememberProject,
  reorderProjects: (command) => reorderProjectsUseCase.execute(command),
  selectCurrentProject,
  selectProjectDirectory,
  switchBranchWorkspace: (command) => switchBranchWorkspaceUseCase.execute(command),
  synchronizeProjectGitState: (command) => synchronizeProjectGitStateUseCase.execute(command)
})

registerBlockGraphIpcHandlers({
  addQuickExecutionTarget: (command) => addQuickExecutionTargetUseCase.execute(command),
  bindQuickExecutionSlot: (command) => bindQuickExecutionSlotUseCase.execute(command),
  clearQuickExecutionSlot: (command) => clearQuickExecutionSlotUseCase.execute(command),
  reorderQuickExecutionSlots: (command) => reorderQuickExecutionSlotsUseCase.execute(command),
  createTerminalBlock: (command) => createTerminalBlockUseCase.execute(command),
  createTerminalGroup: (command) => createTerminalGroupUseCase.execute(command),
  connectTerminalBlocks: (command) => connectTerminalBlocksUseCase.execute(command),
  deleteBlock: (command) => deleteBlockUseCase.execute(command),
  deleteTerminalScope: (command) => deleteTerminalScopeUseCase.execute(command),
  dissolveTerminalGroup: (command) => dissolveTerminalGroupUseCase.execute(command),
  disconnectTerminalBlocks: (command) => disconnectTerminalBlocksUseCase.execute(command),
  ipcMain,
  logger: consoleLogger,
  moveBlock: (command) => moveBlockUseCase.execute(command),
  moveTerminalGroup: (command) => moveTerminalGroupUseCase.execute(command),
  moveTerminalWorkflowToGroup: (command) => moveTerminalWorkflowToGroupUseCase.execute(command),
  resizeTerminalBlock: (command) => resizeTerminalBlockUseCase.execute(command),
  setTerminalGroupCollapsed: (command) => setTerminalGroupCollapsedUseCase.execute(command),
  updateGraphViewport: (command) => updateGraphViewportUseCase.execute(command),
  updateTerminalGroupMetadata: (command) => updateTerminalGroupMetadataUseCase.execute(command),
  updateTerminalBlockMetadata: (command) => updateTerminalBlockMetadataUseCase.execute(command),
  updateTerminalDefinition: (command) => updateTerminalDefinitionUseCase.execute(command),
  updateTerminalExecutionConfig: (command) => updateTerminalExecutionConfigUseCase.execute(command)
})

registerBlockTemplateIpcHandlers({
  deleteBlockTemplate: (command) => deleteBlockTemplateUseCase.execute(command),
  instantiateBlockTemplate: (command) => instantiateBlockTemplateUseCase.execute(command),
  ipcMain,
  listBlockTemplates: (query) => listBlockTemplatesUseCase.execute(query),
  logger: consoleLogger,
  moveBlockTemplate: (command) => moveBlockTemplateUseCase.execute(command),
  saveBlockTemplate: (command) => saveBlockTemplateUseCase.execute(command),
  updateBlockTemplate: (command) => updateBlockTemplateUseCase.execute(command)
})

const terminalViewLifecycle = registerTerminalIpcHandlers({
  attachTerminalView: (command) => terminalSessionService.attachView(command),
  detachTerminalView: (command) => terminalSessionService.detachView(command),
  getTerminalRuntimeAvailability,
  interruptTerminal: (sessionId) => terminalSessionService.interrupt(sessionId),
  ipcMain,
  launchTerminal: (command) => launchTerminal.execute(command),
  listTerminalSessions: (sessionIds) => terminalSessionService.listSessions(sessionIds),
  listRecoveredTerminalSessions: () => terminalSessionService.listAllSessions(),
  listRecoveredTerminalServiceEndpoints: () => terminalManagedServices.listActive(),
  listTerminalWorkingDirectories: (sessionIds) =>
    terminalSessionService.listWorkingDirectories(sessionIds),
  logger: consoleLogger,
  openTerminalServiceEndpoint: (command) => openTerminalServiceEndpoint.execute(command),
  openTerminalLink: (command) => openTerminalLink.execute(command),
  resolveManagedServiceOwner,
  resizeTerminal: (sessionId, columns, rows) =>
    terminalSessionService.resize(sessionId, columns, rows),
  retryTerminalRuntime,
  startTerminal: (command) => terminalSessionService.start(command),
  setTerminalRetention: (sessionId, retentionPolicy) =>
    terminalSessionService.setRetentionPolicy(sessionId, retentionPolicy),
  terminateTerminal: (sessionId) => terminalSessionService.terminate(sessionId),
  updateTerminalScrollback: (rows) => terminalSessionService.updateTerminalScrollback(rows),
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
      ? Promise.resolve(
          createDisabledAgentSessionSnapshot({
            ...command,
            providerId: command.providerId ?? defaultAgentProviderId
          })
        )
      : agentSessionService.attach(command),
  createWorkspaceAgent: (command) => createWorkspaceAgentUseCase.execute(command),
  discoverCreatableAgentProviders: (options) =>
    discoverCreatableAgentProvidersUseCase.execute(options),
  disposeAgentWorkspaceSession: (command) =>
    isAgentAutostartDisabledForTest
      ? Promise.resolve()
      : disposeRuntime(() => agentSessionService.disposeSession(command)),
  disposeProjectAgentSessions: (projectDirectory) =>
    isAgentAutostartDisabledForTest
      ? Promise.resolve()
      : disposeRuntime(() => agentSessionService.disposeProject(projectDirectory)),
  getAgentProviderPreferences: () => getAgentProviderPreferencesUseCase.execute(),
  inspectAgentProvider: (providerId) => inspectAgentProviderUseCase.execute(providerId),
  listAgentProviders: () => listAgentProvidersUseCase.execute(),
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
    updateWorkspaceAgentMcpCapabilityUseCase.execute(command),
  updateAgentProviderPreferences: (command) =>
    updateAgentProviderPreferencesUseCase.execute(command)
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
    workspaceId: currentWorkspace.workspaceId
  })
  const agents = await listWorkspaceAgentsUseCase.execute({
    projectId: project.id,
    workspaceId: currentWorkspace.workspaceId
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
  readonly workspaceId: string
}): Promise<BlockGraphSnapshot> {
  const project = await projectRepository.findByDirectory(command.projectDirectory)

  return getDefaultGraphUseCase.execute({
    projectDirectory: command.projectDirectory,
    projectId: project?.id ?? command.projectDirectory,
    workspaceId: command.workspaceId
  })
}

async function rememberProject(directory: string): Promise<void> {
  await rememberProjectUseCase.execute({ directory })
}

async function selectCurrentProject(directory: string | null): Promise<void> {
  await selectCurrentProjectUseCase.execute({ directory })
}

async function loadRememberedWorkbenches(): Promise<WorkbenchSnapshot[]> {
  return loadRememberedWorkbenchList({
    findProject: (directory) => projectRepository.findByDirectory(directory),
    listRememberedProjects: () =>
      new ListRememberedProjectsUseCase(getProjectRegistryRepository()).execute(),
    loadWorkbench,
    openProject: (command) => createOrOpenProjectUseCase.execute(command),
    selectCurrentProject
  })
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
    process.env.CLEANCODE_TEST_APP_STATE_DIRECTORY ??
    join(app.getPath('userData'), 'project-state-v2')
  )
}

if (isPrimaryAppInstance) {
  void app.whenReady().then(async () => {
    try {
      await initializeRunRuntime()
    } catch (error) {
      consoleLogger.error({
        scope: 'run.terminal-provider',
        operation: 'initializeRuntime',
        outcome: 'failure',
        error: { message: error instanceof Error ? error.message : String(error) }
      })
    }
    const appIconPath = resolveAppIconPath({
      fileExists: existsSync,
      isDevelopment: Boolean(process.env.ELECTRON_RENDERER_URL),
      mainDirectory: __dirname,
      projectDirectory: process.cwd()
    })

    if (process.platform === 'darwin' && appIconPath) {
      app.dock?.setIcon(appIconPath)
    }

    createMainWindow({ appIconPath, policy: electronWindowPolicy })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow({ appIconPath, policy: electronWindowPolicy })
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let isReadyToQuit = false
let isPreparingToQuit = false
const applicationRuntimeShutdown = createApplicationRuntimeShutdownCoordinator({
  completeAgentSessions: () => agentSessionService.completeApplicationShutdown(),
  completeTerminalWorkflows: () => terminalWorkflowService.completeApplicationShutdown(),
  disposeRunLifecycle: () => runLifecycleService.prepareApplicationShutdown(),
  disposeTerminalSessions: () => terminalSessionService.prepareApplicationShutdown(),
  disposeTerminalViews: () => terminalViewLifecycle.prepareApplicationShutdown(),
  logger: consoleLogger,
  prepareAgentSessions: () => agentSessionService.prepareApplicationShutdown(),
  prepareTerminalWorkflows: () => terminalWorkflowService.prepareApplicationShutdown()
})

app.on('before-quit', (event) => {
  if (isReadyToQuit) {
    return
  }

  event.preventDefault()
  if (isPreparingToQuit) {
    return
  }

  isPreparingToQuit = true
  void applicationRuntimeShutdown.dispose().finally(() => {
    isReadyToQuit = true
    app.quit()
  })
})
