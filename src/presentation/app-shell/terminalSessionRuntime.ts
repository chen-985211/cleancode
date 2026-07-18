import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalRunIdentity, TerminalServiceEndpoint, TerminalViewState } from './types'

export interface StartTerminalRuntimeCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly columns: number
  readonly rows: number
}

export type LaunchTerminalRuntimeCommand = StartTerminalRuntimeCommand

export interface LaunchTerminalRuntimeResult {
  readonly session: TerminalSessionSnapshot
  readonly endpoint: TerminalServiceEndpoint | null
}

export async function startTerminalRuntimeSession(
  command: StartTerminalRuntimeCommand
): Promise<TerminalSessionSnapshot | undefined> {
  const api = window.cleancode as TerminalSessionRuntimeApi | undefined
  return api?.startTerminal(command)
}

export async function launchTerminalRuntimeSession(
  command: LaunchTerminalRuntimeCommand
): Promise<LaunchTerminalRuntimeResult | undefined> {
  const api = window.cleancode as TerminalSessionRuntimeApi | undefined
  return api?.launchTerminal?.(command)
}

function toTerminalRunIdentity(session: TerminalSessionSnapshot): TerminalRunIdentity {
  return {
    projectId: session.projectId,
    workspaceName: session.workspaceName,
    blockId: session.blockId,
    sessionId: session.sessionId,
    runId: session.runId,
    generation: session.generation
  }
}

function toTerminalViewState(
  session: TerminalSessionSnapshot,
  output: string,
  actualEndpoint: TerminalServiceEndpoint | null = null
): TerminalViewState {
  return {
    sessionId: session.id,
    status: session.status,
    output,
    runIdentity: toTerminalRunIdentity(session),
    actualEndpoint,
    portConflict: null
  }
}

export function applyTerminalSessionSnapshot(
  states: Record<string, TerminalViewState>,
  terminalStateKey: string,
  session: TerminalSessionSnapshot,
  output: string,
  actualEndpoint: TerminalServiceEndpoint | null
): Record<string, TerminalViewState> {
  const currentIdentity = states[terminalStateKey]?.runIdentity
  const nextIdentity = toTerminalRunIdentity(session)
  if (
    currentIdentity &&
    (currentIdentity.generation > nextIdentity.generation ||
      (currentIdentity.generation === nextIdentity.generation &&
        (currentIdentity.runId !== nextIdentity.runId ||
          currentIdentity.sessionId !== nextIdentity.sessionId)))
  ) {
    return states
  }

  return {
    ...states,
    [terminalStateKey]: toTerminalViewState(session, output, actualEndpoint)
  }
}

interface TerminalSessionRuntimeApi {
  readonly startTerminal: (
    command: StartTerminalRuntimeCommand
  ) => Promise<TerminalSessionSnapshot | undefined>
  readonly launchTerminal?: (
    command: LaunchTerminalRuntimeCommand
  ) => Promise<LaunchTerminalRuntimeResult | undefined>
}
