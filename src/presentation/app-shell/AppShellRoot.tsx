import { AppShell } from './AppShell'
import { I18nProvider } from './i18n/I18nProvider'
import { NotificationProvider } from './NotificationProvider'
import { useNotifications } from './useNotifications'

export function AppShellRoot() {
  return (
    <I18nProvider>
      <NotificationProvider>
        <NotifiedAppShell />
      </NotificationProvider>
    </I18nProvider>
  )
}

function NotifiedAppShell() {
  const notifications = useNotifications()

  return <AppShell notifications={notifications} />
}
