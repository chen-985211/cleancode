import type { ManagedAgentSession } from './AgentSessionRuntimeState'

export async function disposeOtherAgentSessionScopes(
  sessions: ReadonlyMap<string, ManagedAgentSession>,
  workspaceDirectory: string,
  agentId: string,
  activeScopeKey: string,
  dispose: (sessionKey: string, session: ManagedAgentSession) => Promise<void>
): Promise<void> {
  for (const [sessionKey, session] of sessions.entries()) {
    if (
      sessionKey !== activeScopeKey &&
      session.agentId === agentId &&
      session.workspaceDirectory === workspaceDirectory
    ) {
      await dispose(sessionKey, session)
    }
  }
}
