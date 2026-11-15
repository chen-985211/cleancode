import '../../../src/platform/renderer-bootstrap/renderer.css'
import '../../../src/presentation/app-shell/shell/AppShell.css'
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ApplicationUpdateSnapshot } from '../../../src/platform/ipc/applicationUpdateChannels'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import { TooltipProvider } from '../../../src/presentation/shared/components/Tooltip'
import { AppShellProjectArea } from '../../../src/presentation/app-shell/shell/project-sidebar/AppShellProjectArea'
import { CanvasStatusbar } from '../../../src/presentation/app-shell/workbench/WorkbenchCanvasStates'
import { ignoreAppNotifications } from '../../../src/presentation/shared/notifications/appNotifications'
import { ApplicationUpdateProvider } from '../../../src/presentation/app-shell/app-features/updates/ApplicationUpdateProvider'
import { createWorkbenchSnapshot } from './appShellFixtures'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') ?? 'light'
const fixtureWindow = window as unknown as Window & {
  publishUpdate: (state: ApplicationUpdateSnapshot) => void
  updateInstallCount: number
}
let snapshot: ApplicationUpdateSnapshot =
  query.get('state') === 'idle'
    ? { revision: 1, status: 'idle', version: null, percent: null }
    : { revision: 1, status: 'downloading', version: '0.2.0', percent: 42 }
const listeners = new Set<(value: ApplicationUpdateSnapshot) => void>()
fixtureWindow.updateInstallCount = 0
fixtureWindow.publishUpdate = (value) => {
  snapshot = value
  for (const listener of listeners) listener(value)
}
window.cleancode = {
  getWorkspaceExternalOpenCapabilities: async () => ({ vscode: { available: false } }),
  getApplicationUpdate: async () => snapshot,
  checkApplicationUpdate: async () => {
    fixtureWindow.publishUpdate({
      revision: snapshot.revision + 1,
      status: 'downloading',
      version: '0.2.0',
      percent: 0
    })
    return snapshot
  },
  installApplicationUpdate: async () => {
    fixtureWindow.updateInstallCount += 1
    return snapshot
  },
  onApplicationUpdateChanged: (listener: (value: ApplicationUpdateSnapshot) => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
} as unknown as NonNullable<Window['cleancode']>
const workbenches = Array.from({ length: 30 }, (_, index) =>
  createWorkbenchSnapshot(`/fixture/project-${index}`, `Project ${index}`, { gitBranch: 'main' })
)
const noop = () => undefined
// This standalone fixture owns its root; the test disables Vite HMR.
// eslint-disable-next-line react-refresh/only-export-components
function Fixture() {
  const [collapsed, setCollapsed] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  return (
    <I18nProvider initialLocale={query.get('locale') === 'en' ? 'en' : 'zh-CN'}>
      <TooltipProvider>
        <ApplicationUpdateProvider>
          <div className={`app-shell${collapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
            <AppShellProjectArea
              workbenches={workbenches}
              currentWorkbench={workbenches[0]!}
              isDesktopRuntime
              isCollapsed={collapsed}
              toggleRef={toggle}
              motion={{ titlebarRef: noop, sidebarRef: noop }}
              toggleTooltip="Toggle sidebar"
              onToggle={() => setCollapsed((value) => !value)}
              onAddProject={noop}
              onArchiveBranchWorkspace={noop}
              onCheckoutMainBranch={noop}
              onCreateBranchWorkspace={noop}
              onRemoveProject={noop}
              onReorderProject={noop}
              onSelectWorkspace={noop}
              onCreateIssueWorkspace={async () => false}
              onProjectChanged={noop}
            />
            <section className="app-shell__workspace">
              <CanvasStatusbar
                isDesktopRuntime
                terminalRuntimeAvailability={{
                  phase: 'ready',
                  epoch: 1,
                  errorCode: null,
                  retryable: false
                }}
                initialWorkbenchLoadPhase="ready"
                currentWorkbench={null}
                currentWorkspace={undefined}
                motionRef={(element) =>
                  element?.setAttribute(
                    'data-project-sidebar-motion-state',
                    collapsed ? 'collapsed' : 'expanded'
                  )
                }
                quickExecutionRef={noop}
                notifications={ignoreAppNotifications}
              />
            </section>
          </div>
        </ApplicationUpdateProvider>
      </TooltipProvider>
    </I18nProvider>
  )
}
createRoot(document.getElementById('root')!).render(<Fixture />)
