import { render, screen } from '@testing-library/react'

import { ignoreAppNotifications } from '../../../src/presentation/app-shell/appNotifications'
import { I18nProvider } from '../../../src/presentation/app-shell/i18n/I18nProvider'
import { CanvasStatusbar } from '../../../src/presentation/app-shell/WorkbenchCanvasStates'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('workspace external open statusbar placement', () => {
  it('places the external open control before the runtime status', async () => {
    const workbench = createWorkbenchSnapshot('/work/app', 'app')
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        getWorkspaceExternalOpenCapabilities: vi.fn(async () => ({
          vscode: { available: true }
        }))
      })
    })

    const { container } = render(
      <I18nProvider initialLocale="zh-CN">
        <CanvasStatusbar
          isDesktopRuntime
          terminalRuntimeAvailability={{
            epoch: 1,
            errorCode: null,
            phase: 'ready',
            retryable: false
          }}
          initialWorkbenchLoadPhase="ready"
          currentWorkbench={workbench}
          currentWorkspace={workbench.project.workspaces[0]}
          notifications={ignoreAppNotifications}
        />
      </I18nProvider>
    )

    const statusbar = container.querySelector<HTMLElement>('.app-shell__statusbar')
    const externalOpen = await screen.findByRole('group', { name: '打开当前工作区' })

    expect(statusbar?.firstElementChild).toBe(externalOpen)
    expect(externalOpen.nextElementSibling).toHaveClass('status-dot')
  })
})
