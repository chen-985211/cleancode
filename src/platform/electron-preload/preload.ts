import { contextBridge, ipcRenderer, webUtils } from 'electron'

import {
  createClientAppError,
  isSerializedAppError
} from '../../shared-kernel/application/errors/AppError'
import type { IpcInvokeResult } from '../ipc/registerIpcHandler'
import {
  applicationQuitChannels,
  type ApplicationQuitConfirmationCommand,
  type ApplicationQuitRequest
} from '../ipc/applicationQuitChannels'
import { windowFullScreenStateChannels } from '../ipc/windowFullScreenStateChannels'

const cleancodeApi = {
  appName: 'cleancode',
  showApplicationQuitConfirmation: (command: ApplicationQuitConfirmationCommand) =>
    invokeCleancode<boolean>(applicationQuitChannels.show, command),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getWindowFullScreenState: () => invokeCleancode<boolean>(windowFullScreenStateChannels.get),
  onWindowFullScreenStateChange: (listener: (event: unknown) => void) =>
    subscribeRendererEvent(windowFullScreenStateChannels.changed, listener),
  onApplicationQuitRequested: (listener: (request: ApplicationQuitRequest) => void) =>
    subscribeRendererEvent(applicationQuitChannels.requested, listener),
  listWorkbenches: () => invokeCleancode('cleancode:list-workbenches'),
  addProject: () => invokeCleancode('cleancode:add-project'),
  removeProject: (command: unknown) => invokeCleancode('cleancode:remove-project', command),
  reorderProject: (command: unknown) => invokeCleancode('cleancode:reorder-project', command),
  createBranchWorkspace: (command: unknown) =>
    invokeCleancode('cleancode:create-branch-workspace', command),
  switchBranchWorkspace: (command: unknown) =>
    invokeCleancode('cleancode:switch-branch-workspace', command),
  archiveBranchWorkspace: (command: unknown) =>
    invokeCleancode('cleancode:archive-branch-workspace', command),
  checkoutMainWorkspaceBranch: (command: unknown) =>
    invokeCleancode('cleancode:checkout-main-workspace-branch', command),
  synchronizeProjectGitState: (command: unknown) =>
    invokeCleancode('cleancode:synchronize-project-git-state', command),
  getWorkspaceExternalOpenCapabilities: () =>
    invokeCleancode('cleancode:get-workspace-external-open-capabilities'),
  openWorkspaceExternally: (command: unknown) =>
    invokeCleancode('cleancode:open-workspace-externally', command),
  inspectAgentProvider: (command: unknown) =>
    invokeCleancode('cleancode:inspect-agent-provider', command),
  getAgentProviderPreferences: () => invokeCleancode('cleancode:get-agent-provider-preferences'),
  updateAgentProviderPreferences: (command: unknown) =>
    invokeCleancode('cleancode:update-agent-provider-preferences', command),
  discoverCreatableAgentProviders: (command?: unknown) =>
    invokeCleancode('cleancode:discover-creatable-agent-providers', command),
  listAgentActivities: () => invokeCleancode('cleancode:list-agent-activities'),
  listAgentProviders: () => invokeCleancode('cleancode:list-agent-providers'),
  attachAgentSession: (command: unknown) =>
    invokeCleancode('cleancode:attach-agent-session', command),
  updateAgentSessionMetadata: (command: unknown) =>
    invokeCleancode('cleancode:update-agent-session-metadata', command),
  createWorkspaceAgent: (command: unknown) =>
    invokeCleancode('cleancode:create-workspace-agent', command),
  renameWorkspaceAgent: (command: unknown) =>
    invokeCleancode('cleancode:rename-workspace-agent', command),
  updateWorkspaceAgentLayout: (command: unknown) =>
    invokeCleancode('cleancode:update-workspace-agent-layout', command),
  updateWorkspaceAgentMcpCapability: (command: unknown) =>
    invokeCleancode('cleancode:update-workspace-agent-mcp-capability', command),
  removeWorkspaceAgent: (command: unknown) =>
    invokeCleancode('cleancode:remove-workspace-agent', command),
  writeAgentSession: (command: unknown) =>
    invokeCleancode('cleancode:write-agent-session', command),
  resizeAgentSession: (command: unknown) =>
    invokeCleancode('cleancode:resize-agent-session', command),
  disposeAgentWorkspaceSession: (command: unknown) =>
    invokeCleancode('cleancode:dispose-agent-workspace-session', command),
  disposeProjectAgentSessions: (command: unknown) =>
    invokeCleancode('cleancode:dispose-project-agent-sessions', command),
  approveAgentTool: (command: unknown) => invokeCleancode('cleancode:approve-agent-tool', command),
  rejectAgentTool: (command: unknown) => invokeCleancode('cleancode:reject-agent-tool', command),
  onAgentRuntimeChanged: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-runtime-changed', listener),
  onAgentActivityChanged: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-activity-changed', listener),
  onAgentTurnCompleted: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-turn-completed', listener),
  onAgentGraphUpdated: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-graph-updated', listener),
  onAgentToolApprovalRequested: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-tool-approval-requested', listener),
  createCanvasStack: (command: unknown) =>
    invokeCleancode('cleancode:create-canvas-stack', command),
  moveCanvasStack: (command: unknown) => invokeCleancode('cleancode:move-canvas-stack', command),
  removeCanvasStack: (command: unknown) =>
    invokeCleancode('cleancode:remove-canvas-stack', command),
  createTerminalBlock: (command: unknown) =>
    invokeCleancode('cleancode:create-terminal-block', command),
  addQuickExecutionTarget: (command: unknown) =>
    invokeCleancode('cleancode:add-quick-execution-target', command),
  bindQuickExecutionSlot: (command: unknown) =>
    invokeCleancode('cleancode:bind-quick-execution-slot', command),
  clearQuickExecutionSlot: (command: unknown) =>
    invokeCleancode('cleancode:clear-quick-execution-slot', command),
  reorderQuickExecutionSlots: (command: unknown) =>
    invokeCleancode('cleancode:reorder-quick-execution-slots', command),
  createTerminalGroup: (command: unknown) =>
    invokeCleancode('cleancode:create-terminal-group', command),
  connectTerminalBlocks: (command: unknown) =>
    invokeCleancode('cleancode:connect-terminal-blocks', command),
  disconnectTerminalBlocks: (command: unknown) =>
    invokeCleancode('cleancode:disconnect-terminal-blocks', command),
  updateTerminalBlockMetadata: (command: unknown) =>
    invokeCleancode('cleancode:update-terminal-block-metadata', command),
  updateTerminalExecutionConfig: (command: unknown) =>
    invokeCleancode('cleancode:update-terminal-execution-config', command),
  updateTerminalDefinition: (command: unknown) =>
    invokeCleancode('cleancode:update-terminal-definition', command),
  updateTerminalGroupMetadata: (command: unknown) =>
    invokeCleancode('cleancode:update-terminal-group-metadata', command),
  setTerminalGroupCollapsed: (command: unknown) =>
    invokeCleancode('cleancode:set-terminal-group-collapsed', command),
  moveTerminalWorkflowToGroup: (command: unknown) =>
    invokeCleancode('cleancode:move-terminal-workflow-to-group', command),
  dissolveTerminalGroup: (command: unknown) =>
    invokeCleancode('cleancode:dissolve-terminal-group', command),
  resizeTerminalBlock: (command: unknown) =>
    invokeCleancode('cleancode:resize-terminal-block', command),
  updateGraphViewport: (command: unknown) =>
    invokeCleancode('cleancode:update-graph-viewport', command),
  moveBlock: (command: unknown) => invokeCleancode('cleancode:move-block', command),
  moveTerminalGroup: (command: unknown) =>
    invokeCleancode('cleancode:move-terminal-group', command),
  deleteBlock: (command: unknown) => invokeCleancode('cleancode:delete-block', command),
  deleteTerminalScope: (command: unknown) =>
    invokeCleancode('cleancode:delete-terminal-scope', command),
  listBlockTemplates: (command: unknown) =>
    invokeCleancode('cleancode:list-block-templates', command),
  saveBlockTemplate: (command: unknown) =>
    invokeCleancode('cleancode:save-block-template', command),
  updateBlockTemplate: (command: unknown) =>
    invokeCleancode('cleancode:update-block-template', command),
  moveBlockTemplate: (command: unknown) =>
    invokeCleancode('cleancode:move-block-template', command),
  deleteBlockTemplate: (command: unknown) =>
    invokeCleancode('cleancode:delete-block-template', command),
  instantiateBlockTemplate: (command: unknown) =>
    invokeCleancode('cleancode:instantiate-block-template', command),
  startTerminal: (command: unknown) => invokeCleancode('cleancode:start-terminal', command),
  launchTerminal: (command: unknown) => invokeCleancode('cleancode:launch-terminal', command),
  openTerminalServiceEndpoint: (command: unknown) =>
    invokeCleancode('cleancode:open-terminal-service-endpoint', command),
  openTerminalLink: (command: unknown) => invokeCleancode('cleancode:open-terminal-link', command),
  writeTerminal: (command: unknown) => invokeCleancode('cleancode:write-terminal', command),
  resizeTerminal: (command: unknown) => invokeCleancode('cleancode:resize-terminal', command),
  interruptTerminal: (command: unknown) => invokeCleancode('cleancode:interrupt-terminal', command),
  listTerminalSessions: (command: unknown) =>
    invokeCleancode('cleancode:list-terminal-sessions', command),
  getTerminalRuntimeAvailability: () =>
    invokeCleancode('cleancode:get-terminal-runtime-availability'),
  retryTerminalRuntime: () => invokeCleancode('cleancode:retry-terminal-runtime'),
  listRecoveredTerminalSessions: () =>
    invokeCleancode('cleancode:list-recovered-terminal-sessions'),
  listRecoveredTerminalServiceEndpoints: () =>
    invokeCleancode('cleancode:list-recovered-terminal-service-endpoints'),
  setTerminalRetention: (command: unknown) =>
    invokeCleancode('cleancode:set-terminal-retention', command),
  listTerminalWorkingDirectories: (command: unknown) =>
    invokeCleancode('cleancode:list-terminal-working-directories', command),
  terminateTerminal: (command: unknown) => invokeCleancode('cleancode:terminate-terminal', command),
  attachTerminalView: (command: unknown) =>
    invokeCleancode('cleancode:attach-terminal-view', command),
  detachTerminalView: (command: unknown) =>
    invokeCleancode('cleancode:detach-terminal-view', command),
  updateTerminalScrollback: (command: unknown) =>
    invokeCleancode('cleancode:update-terminal-scrollback', command),
  startTerminalWorkflow: (command: unknown) =>
    invokeCleancode('cleancode:start-terminal-workflow', command),
  stopTerminalWorkflow: (command: unknown) =>
    invokeCleancode('cleancode:stop-terminal-workflow', command),
  getTerminalWorkflows: (command: unknown) =>
    invokeCleancode('cleancode:get-terminal-workflows', command),
  onTerminalWorkflowEvent: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:terminal-workflow-event', listener),
  onTerminalRunEvent: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:terminal-run-event', listener),
  onTerminalOutput: (listener: (event: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, outputEvent: unknown) => {
      listener(outputEvent)
    }

    ipcRenderer.on('cleancode:terminal-output', subscription)

    return () => ipcRenderer.removeListener('cleancode:terminal-output', subscription)
  },
  onTerminalViewOutput: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:terminal-view-output', listener),
  onTerminalSessionUpdated: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:terminal-session-updated', listener),
  onTerminalWorkingDirectoryChanged: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:terminal-working-directory-changed', listener),
  onTerminalRuntimeAvailability: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:terminal-runtime-availability', listener),
  onTerminalExit: (listener: (event: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, exitEvent: unknown) => {
      listener(exitEvent)
    }

    ipcRenderer.on('cleancode:terminal-exit', subscription)

    return () => ipcRenderer.removeListener('cleancode:terminal-exit', subscription)
  }
} as const

contextBridge.exposeInMainWorld('cleancode', cleancodeApi)

function subscribeRendererEvent<TEvent>(
  channel: string,
  listener: (event: TEvent) => void
): () => void {
  const subscription = (_event: Electron.IpcRendererEvent, payload: unknown) => {
    listener(payload as TEvent)
  }

  ipcRenderer.on(channel, subscription)

  return () => ipcRenderer.removeListener(channel, subscription)
}

async function invokeCleancode<TResult>(channel: string, command?: unknown): Promise<TResult> {
  const result = (await ipcRenderer.invoke(channel, command)) as IpcInvokeResult<TResult>

  if (isIpcFailureResult(result)) {
    throw createClientAppError(result.error)
  }

  if (isIpcSuccessResult(result)) {
    return result.value
  }

  throw createClientAppError({
    code: 'UNEXPECTED_ERROR',
    isExpected: false,
    message: 'Unexpected application error.'
  })
}

function isIpcSuccessResult<TResult>(
  result: IpcInvokeResult<TResult> | unknown
): result is Extract<IpcInvokeResult<TResult>, { readonly ok: true }> {
  return isRecord(result) && result.ok === true && 'value' in result
}

function isIpcFailureResult<TResult>(
  result: IpcInvokeResult<TResult> | unknown
): result is Extract<IpcInvokeResult<TResult>, { readonly ok: false }> {
  return isRecord(result) && result.ok === false && isSerializedAppError(result.error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
