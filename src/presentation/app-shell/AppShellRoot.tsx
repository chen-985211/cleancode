import { AppShell } from './AppShell'
import { NotificationProvider } from './NotificationProvider'
import { useNotifications } from './useNotifications'

export function AppShellRoot() {
  return (
    <NotificationProvider>
      <NotifiedAppShell />
    </NotificationProvider>
  )
}

function NotifiedAppShell() {
  const notifications = useNotifications()

  return <AppShell notifications={notifications} />
}
