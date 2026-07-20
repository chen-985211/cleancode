import { AppShell } from './AppShell'
import { I18nProvider } from './i18n/I18nProvider'
import { NotificationProvider } from './NotificationProvider'
import { TooltipProvider } from './Tooltip'
import { useNotifications } from './useNotifications'

export function AppShellRoot() {
  return (
    <I18nProvider>
      <TooltipProvider>
        <NotificationProvider>
          <NotifiedAppShell />
        </NotificationProvider>
      </TooltipProvider>
    </I18nProvider>
  )
}

function NotifiedAppShell() {
  const notifications = useNotifications()

  return <AppShell notifications={notifications} />
}
