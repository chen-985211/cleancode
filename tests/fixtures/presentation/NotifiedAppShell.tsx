import { AppShell } from '../../../src/presentation/app-shell/shell/AppShell'
import { NotificationProvider } from '../../../src/presentation/app-shell/app-features/notifications/NotificationProvider'
import { useNotifications } from '../../../src/presentation/app-shell/app-features/notifications/useNotifications'

export function NotifiedAppShell() {
  return (
    <NotificationProvider>
      <AppShellWithNotifications />
    </NotificationProvider>
  )
}

function AppShellWithNotifications() {
  const notifications = useNotifications()

  return <AppShell notifications={notifications} />
}
