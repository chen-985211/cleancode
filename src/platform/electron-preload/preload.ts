import { contextBridge, ipcRenderer } from 'electron'

import {
  createClientAppError,
  isSerializedAppError
} from '../../shared-kernel/application/errors/AppError'
import type { IpcInvokeResult } from '../ipc/registerIpcHandler'

const cleancodeApi = {
  appName: 'cleancode',
  listWorkbenches: () => invokeCleancode('cleancode:list-workbenches'),
  addProject: () => invokeCleancode('cleancode:add-project'),
  removeProject: (command: unknown) => invokeCleancode('cleancode:remove-project', command),
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
  inspectCodexCli: () => invokeCleancode('cleancode:inspect-codex-cli'),
  attachAgentSession: (command: unknown) =>
    invokeCleancode('cleancode:attach-agent-session', command),
  createWorkspaceAgent: (command: unknown) =>
    invokeCleancode('cleancode:create-workspace-agent', command),
  renameWorkspaceAgent: (command: unknown) =>
    invokeCleancode('cleancode:rename-workspace-agent', command),
  updateWorkspaceAgentLayout: (command: unknown) =>
    invokeCleancode('cleancode:update-workspace-agent-layout', command),
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
  onAgentPtyOutput: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-pty-output', listener),
  onAgentPtyExit: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-pty-exit', listener),
  onAgentGraphUpdated: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-graph-updated', listener),
  onAgentToolApprovalRequested: (listener: (event: unknown) => void) =>
    subscribeRendererEvent('cleancode:agent-tool-approval-requested', listener),
  createTerminalBlock: (command: unknown) =>
    invokeCleancode('cleancode:create-terminal-block', command),
  createTerminalGroup: (command: unknown) =>
    invokeCleancode('cleancode:create-terminal-group', command),
  updateTerminalBlockMetadata: (command: unknown) =>
    invokeCleancode('cleancode:update-terminal-block-metadata', command),
  updateTerminalGroupMetadata: (command: unknown) =>
    invokeCleancode('cleancode:update-terminal-group-metadata', command),
  setTerminalGroupCollapsed: (command: unknown) =>
    invokeCleancode('cleancode:set-terminal-group-collapsed', command),
  addTerminalToGroup: (command: unknown) =>
    invokeCleancode('cleancode:add-terminal-to-group', command),
  removeTerminalFromGroup: (command: unknown) =>
    invokeCleancode('cleancode:remove-terminal-from-group', command),
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
  saveGraph: (command: unknown) => invokeCleancode('cleancode:save-graph', command),
  startTerminal: (command: unknown) => invokeCleancode('cleancode:start-terminal', command),
  writeTerminal: (command: unknown) => invokeCleancode('cleancode:write-terminal', command),
  resizeTerminal: (command: unknown) => invokeCleancode('cleancode:resize-terminal', command),
  interruptTerminal: (command: unknown) => invokeCleancode('cleancode:interrupt-terminal', command),
  listTerminalWorkingDirectories: (command: unknown) =>
    invokeCleancode('cleancode:list-terminal-working-directories', command),
  terminateTerminal: (command: unknown) => invokeCleancode('cleancode:terminate-terminal', command),
  onTerminalOutput: (listener: (event: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, outputEvent: unknown) => {
      listener(outputEvent)
    }

    ipcRenderer.on('cleancode:terminal-output', subscription)

    return () => ipcRenderer.removeListener('cleancode:terminal-output', subscription)
  },
  onTerminalExit: (listener: (event: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, exitEvent: unknown) => {
      listener(exitEvent)
    }

    ipcRenderer.on('cleancode:terminal-exit', subscription)

    return () => ipcRenderer.removeListener('cleancode:terminal-exit', subscription)
  }
} as const

contextBridge.exposeInMainWorld('cleancode', cleancodeApi)

function subscribeRendererEvent(channel: string, listener: (event: unknown) => void): () => void {
  const subscription = (_event: Electron.IpcRendererEvent, payload: unknown) => {
    listener(payload)
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
