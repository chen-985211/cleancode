import { useCallback, useRef, useState } from 'react'

import { AppShell } from './AppShell'
import type {
  AgentActivityNavigationRequest,
  AgentActivityNavigationTarget
} from './agentActivityNavigation'
import { I18nProvider } from './i18n/I18nProvider'
import { NotificationProvider } from './NotificationProvider'
import { TooltipProvider } from './Tooltip'
import { useNotifications } from './useNotifications'
import { ApplicationQuitConfirmationBridge } from './ApplicationQuitConfirmationBridge'

export function AppShellRoot() {
  const nextNavigationRequestIdRef = useRef(0)
  const [navigationRequest, setNavigationRequest] = useState<AgentActivityNavigationRequest | null>(
    null
  )
  const navigateToAgentActivity = useCallback((target: AgentActivityNavigationTarget): void => {
    nextNavigationRequestIdRef.current += 1
    setNavigationRequest({ ...target, requestId: nextNavigationRequestIdRef.current })
  }, [])
  const handleAgentActivityNavigation = useCallback((requestId: number): void => {
    setNavigationRequest((current) => (current?.requestId === requestId ? null : current))
  }, [])

  return (
    <I18nProvider>
      <ApplicationQuitConfirmationBridge />
      <TooltipProvider>
        <NotificationProvider>
          <NotifiedAppShell
            navigationRequest={navigationRequest}
            onAgentActivityNavigate={navigateToAgentActivity}
            onNavigationHandled={handleAgentActivityNavigation}
          />
        </NotificationProvider>
      </TooltipProvider>
    </I18nProvider>
  )
}

function NotifiedAppShell({
  navigationRequest,
  onAgentActivityNavigate,
  onNavigationHandled
}: {
  readonly navigationRequest: AgentActivityNavigationRequest | null
  readonly onAgentActivityNavigate: (target: AgentActivityNavigationTarget) => void
  readonly onNavigationHandled: (requestId: number) => void
}) {
  const notifications = useNotifications()

  return (
    <AppShell
      agentActivityNavigationRequest={navigationRequest}
      notifications={notifications}
      onAgentActivityNavigate={onAgentActivityNavigate}
      onAgentActivityNavigationHandled={onNavigationHandled}
    />
  )
}
