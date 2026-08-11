import type { AgentActivityNavigationRequest } from './agentActivityNavigation'
import type { AppNotificationController } from './appNotifications'

export interface AppShellProps {
  readonly agentActivityNavigationRequest?: AgentActivityNavigationRequest | null
  readonly notifications?: AppNotificationController
  readonly onAgentActivityNavigationHandled?: (requestId: number) => void
}

export const ignoreAgentActivityNavigationHandled = (): void => undefined
