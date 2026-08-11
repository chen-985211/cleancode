import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import { NotificationProvider } from '../../../src/presentation/app-shell/NotificationProvider'
import { useNotifications } from '../../../src/presentation/app-shell/useNotifications'

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
