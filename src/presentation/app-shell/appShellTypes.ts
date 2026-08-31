import type {
  AgentActivityNavigationRequest,
  AgentActivityNavigationTarget
} from './agentActivityNavigation'
import type { AppNotificationController } from './appNotifications'

export interface AppShellProps {
  readonly agentActivityNavigationRequest?: AgentActivityNavigationRequest | null
  readonly notifications?: AppNotificationController
  readonly onAgentActivityNavigate?: (target: AgentActivityNavigationTarget) => void
  readonly onAgentActivityNavigationHandled?: (requestId: number) => void
}

export const ignoreAgentActivityNavigationHandled = (): void => undefined
