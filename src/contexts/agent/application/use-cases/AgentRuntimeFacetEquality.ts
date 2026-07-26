import type { AgentRuntimeSnapshot } from '../dto/AgentSessionProtocol'

/**
 * Pure facet comparison for `AgentRuntimeSnapshot`. Runtime transitions only publish an
 * event and advance `revision` when one of these reports an actual change, so every field
 * that carries a distinct fact must be compared here.
 */
export function haveSameLaunchRuntime(
  first: AgentRuntimeSnapshot['launch'],
  second: AgentRuntimeSnapshot['launch']
): boolean {
  return (
    first.exitCode === second.exitCode &&
    first.failureKind === second.failureKind &&
    first.generation === second.generation &&
    first.launchId === second.launchId &&
    first.status === second.status
  )
}

export function haveSameLaunchIdentity(
  first: { readonly generation: number; readonly launchId: string },
  second: { readonly generation: number; readonly launchId: string }
): boolean {
  return first.generation === second.generation && first.launchId === second.launchId
}

export function haveSameTerminalRuntime(
  first: AgentRuntimeSnapshot['terminal'],
  second: AgentRuntimeSnapshot['terminal']
): boolean {
  return (
    first.exitCode === second.exitCode &&
    first.processId === second.processId &&
    first.status === second.status &&
    first.stopReason === second.stopReason &&
    haveSameTerminalViewIdentity(first.viewIdentity, second.viewIdentity)
  )
}

function haveSameTerminalViewIdentity(
  first: AgentRuntimeSnapshot['terminal']['viewIdentity'],
  second: AgentRuntimeSnapshot['terminal']['viewIdentity']
): boolean {
  if (first === null || second === null) return first === second
  return (
    first.blockId === second.blockId &&
    first.generation === second.generation &&
    first.owner.id === second.owner.id &&
    first.owner.kind === second.owner.kind &&
    first.projectId === second.projectId &&
    first.runId === second.runId &&
    first.sessionId === second.sessionId &&
    first.workspaceId === second.workspaceId
  )
}
