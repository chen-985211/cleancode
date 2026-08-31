import { useCallback, type ReactNode } from 'react'

import type { AgentTurnCompletedEvent } from '../../contexts/agent/application/dto/AgentActivityProtocol'
import { AgentActivityObserver } from './AgentActivityObserver'
import type { AgentActivityNavigationTarget } from './agentActivityNavigation'
import { AgentProviderStateProvider } from './AgentProviderStateProvider'
import type { AppNotificationController } from '../shared/notifications/appNotifications'
import { TerminalSurfaceRegistryProvider } from './TerminalSurfaceRegistryProvider'
import type { TerminalSurfaceRegistry } from './terminalSurfaceRegistry'

export function AppShellProviders({
  children,
  notifications,
  onAgentActivityNavigate = ignoreAgentActivityNavigate,
  terminalSurfaceRegistry
}: {
  readonly children: ReactNode
  readonly notifications: AppNotificationController
  readonly onAgentActivityNavigate?: (target: AgentActivityNavigationTarget) => void
  readonly terminalSurfaceRegistry: TerminalSurfaceRegistry
}) {
  const waitForCompletionPresentation = useCallback(
    (completion: AgentTurnCompletedEvent) =>
      terminalSurfaceRegistry.waitForOutputSettled(completion.identity.terminal),
    [terminalSurfaceRegistry]
  )

  return (
    <AgentProviderStateProvider>
      <TerminalSurfaceRegistryProvider registry={terminalSurfaceRegistry}>
        <AgentActivityObserver
          notifications={notifications}
          onNavigate={onAgentActivityNavigate}
          waitForCompletionPresentation={waitForCompletionPresentation}
        >
          {children}
        </AgentActivityObserver>
      </TerminalSurfaceRegistryProvider>
    </AgentProviderStateProvider>
  )
}

const ignoreAgentActivityNavigate = (): void => undefined
