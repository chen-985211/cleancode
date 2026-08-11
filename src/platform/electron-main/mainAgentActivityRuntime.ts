import { BrowserWindow } from 'electron'

import type {
  AgentActivityRegistryEvent,
  AgentActivityTerminalScope
} from '../../contexts/agent/application/dto/AgentActivityProtocol'
import type { TerminalSessionService } from '../../contexts/run/application/use-cases/TerminalSessionService'
import {
  createTerminalRunSlotKey,
  isSameTerminalRun
} from '../../contexts/run/domain/value-objects/TerminalRunScope'
import type { Logger } from '../logging/Logger'
import {
  createAgentActivityRuntime,
  type AgentActivityRuntime
} from './agentActivityRuntimeComposition'

export interface MainAgentActivityRuntime extends AgentActivityRuntime {
  bindTerminalSessions(sessions: Pick<TerminalSessionService, 'getSession'>): void
  initializeFailOpen(): void
  readonly terminalSessionLifecycleObserver: {
    terminalEnded(scope: AgentActivityTerminalScope): void
  }
}

export function createMainAgentActivityRuntime(input: {
  readonly appStateDirectory: string
  readonly logger: Logger
  readonly runtimeExecutable: string
}): MainAgentActivityRuntime {
  let sessions: Pick<TerminalSessionService, 'getSession'> | null = null
  const runtime = createAgentActivityRuntime({
    ...input,
    isTerminalScopeActive: (scope) => {
      const session = sessions?.getSession(scope.sessionId)
      return Boolean(session && isActiveTerminal(session, scope))
    },
    publish: publishAgentActivityEvent
  })

  return Object.assign(runtime, {
    bindTerminalSessions: (nextSessions: Pick<TerminalSessionService, 'getSession'>) => {
      sessions = nextSessions
    },
    initializeFailOpen: () => {
      void runtime.initialize().catch((error: unknown) => {
        try {
          input.logger.warn({
            scope: 'agent.terminal-activity',
            operation: 'initializeAgentActivityRuntime',
            outcome: 'failure',
            error: { message: error instanceof Error ? error.message : String(error) }
          })
        } catch {
          // Optional Agent telemetry must not create an unhandled startup rejection.
        }
      })
    },
    terminalSessionLifecycleObserver: {
      terminalEnded: (scope: AgentActivityTerminalScope) => {
        runtime.releaseTerminal(scope)
      }
    }
  })
}

function isActiveTerminal(
  session: NonNullable<ReturnType<TerminalSessionService['getSession']>>,
  scope: AgentActivityTerminalScope
): boolean {
  return (
    session.status === 'running' &&
    session.projectDirectory === scope.projectDirectory &&
    session.workspaceDirectory === scope.workspaceDirectory &&
    session.gitBranch === scope.gitBranch &&
    createTerminalRunSlotKey(session) === createTerminalRunSlotKey(scope) &&
    isSameTerminalRun(session, scope)
  )
}

function publishAgentActivityEvent(event: AgentActivityRegistryEvent): void {
  const channel =
    event.type === 'activity_changed'
      ? 'cleancode:agent-activity-changed'
      : 'cleancode:agent-turn-completed'
  const payload = event.type === 'activity_changed' ? event.snapshot : event.completion
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}
