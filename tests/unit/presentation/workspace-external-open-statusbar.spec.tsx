import { render, screen } from '@testing-library/react'

import { ignoreAppNotifications } from '../../../src/presentation/shared/notifications/appNotifications'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import { CanvasStatusbar } from '../../../src/presentation/app-shell/workbench/WorkbenchCanvasStates'
import { readWorkbenchCanvasObstructions } from '../../../src/presentation/app-shell/workbench/viewport/workbenchCanvasSafeViewport'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('workspace external open statusbar placement', () => {
  it.each(
    (['zh-CN', 'en'] as const).flatMap((locale) =>
      (['initializing', 'ready', 'unavailable', 'shutting-down'] as const).map((phase) => ({
        locale,
        phase
      }))
    )
  )(
    'keeps the statusbar quiet during project restoration in $locale with runtime $phase',
    ({ locale, phase }) => {
      const { container } = render(
        <I18nProvider initialLocale={locale}>
          <CanvasStatusbar
            isDesktopRuntime
            terminalRuntimeAvailability={{ phase, epoch: 1, errorCode: null, retryable: false }}
            initialWorkbenchLoadPhase="loading"
            currentWorkbench={null}
            currentWorkspace={undefined}
            notifications={ignoreAppNotifications}
          />
        </I18nProvider>
      )

      const statusbar = container.querySelector('.app-shell__statusbar')
      expect(statusbar?.textContent).toBe('')
      expect(statusbar?.querySelector('.status-dot')).toBeNull()
    }
  )

  it.each([
    { locale: 'zh-CN', openLabel: '打开当前工作区', connectedLabel: '已连接本地运行时' },
    {
      locale: 'en',
      openLabel: 'Open current workspace',
      connectedLabel: 'Local runtime connected'
    }
  ] as const)(
    'keeps the workspace controls without connected status in $locale',
    async ({ locale, openLabel, connectedLabel }) => {
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
        <I18nProvider initialLocale={locale}>
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
      const externalOpen = await screen.findByRole('group', { name: openLabel })

      expect(statusbar?.firstElementChild).toBe(externalOpen)
      expect(externalOpen.nextElementSibling).toHaveClass('status-path')
      expect(externalOpen.nextElementSibling).toHaveTextContent('/work/app')
      expect(statusbar?.querySelector('.status-dot')).toBeNull()
      expect(screen.queryByText(connectedLabel)).not.toBeInTheDocument()
      expect(readWorkbenchCanvasObstructions()).toContain(statusbar)
      expect(statusbar?.querySelector('.canvas-statusbar-glass')).toHaveAttribute(
        'aria-hidden',
        'true'
      )
    }
  )
})
