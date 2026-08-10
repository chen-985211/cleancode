import { AppShell } from './AppShell'
import { AgentActivityObserver } from './AgentActivityObserver'
import { I18nProvider } from './i18n/I18nProvider'
import { NotificationProvider } from './NotificationProvider'
import { TooltipProvider } from './Tooltip'
import { useNotifications } from './useNotifications'

export function AppShellRoot() {
  return (
    <I18nProvider>
      <TooltipProvider>
        <NotificationProvider>
          <AgentActivityObserver>
            <NotifiedAppShell />
          </AgentActivityObserver>
        </NotificationProvider>
      </TooltipProvider>
    </I18nProvider>
  )
}

function NotifiedAppShell() {
  const notifications = useNotifications()

  return <AppShell notifications={notifications} />
}
