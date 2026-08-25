// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'

interface NativeQuitDialogObservation {
  readonly options: {
    readonly buttons?: readonly string[]
    readonly cancelId?: number
    readonly defaultId?: number
    readonly detail?: string
    readonly message?: string
    readonly noLink?: boolean
    readonly type?: string
  }
  readonly parentWindowId: number | null
}

describe('application quit confirmation e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-application-quit-confirmation-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench)
    resources.electronApp = electronApp
    page = await electronApp.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'routes the quit shortcut through a minimal native modal and keeps running on cancel',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
    async () => {
      await expectDesktopRuntime(page)
      await installNativeQuitDialogProbe(electronApp)

      await pressApplicationQuitShortcut(electronApp)

      const observation = await waitForNativeQuitDialogObservation(electronApp)
      expect(observation.options).toEqual({
        buttons: ['取消', '退出'],
        cancelId: 0,
        defaultId: 0,
        message: '退出 cleancode？',
        noLink: true,
        type: 'none'
      })
      expect(observation.parentWindowId).not.toBeNull()
      expect(await page.getByRole('alertdialog').count()).toBe(0)
      expect(electronApp.process().exitCode).toBeNull()

      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.locator('.application-settings-surface').waitFor()
    }
  )
})

async function installNativeQuitDialogProbe(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow, dialog }) => {
    const runtime = globalThis as typeof globalThis & {
      __cleancodeNativeQuitDialogObservation?: NativeQuitDialogObservation
    }

    Object.defineProperty(dialog, 'showMessageBox', {
      configurable: true,
      value: async (...args: unknown[]) => {
        const options = args.at(-1) as NativeQuitDialogObservation['options']
        const parentWindow = args.length === 2 ? (args[0] as { readonly id?: number }) : undefined
        runtime.__cleancodeNativeQuitDialogObservation = {
          options,
          parentWindowId: parentWindow?.id ?? null
        }
        return { checkboxChecked: false, response: 0 }
      }
    })

    if (!BrowserWindow.getAllWindows()[0]) throw new Error('Expected the main application window.')
  })
}

async function waitForNativeQuitDialogObservation(
  electronApp: ElectronApplication
): Promise<NativeQuitDialogObservation> {
  const observation = await pollUntilState({
    accept: (observation) => observation !== null,
    description: 'native application quit confirmation',
    observe: () =>
      electronApp.evaluate(() => {
        const runtime = globalThis as typeof globalThis & {
          __cleancodeNativeQuitDialogObservation?: NativeQuitDialogObservation
        }
        return runtime.__cleancodeNativeQuitDialogObservation ?? null
      }),
    timeoutMs: 5_000
  })
  if (!observation) throw new Error('Expected the native application quit confirmation.')
  return observation
}

async function pressApplicationQuitShortcut(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, platform) => {
    const target = BrowserWindow.getAllWindows()[0]
    if (!target) throw new Error('Expected the main application window.')

    target.webContents.sendInputEvent({
      keyCode: 'Q',
      modifiers: [platform === 'darwin' ? 'meta' : 'control'],
      type: 'keyDown'
    })
  }, process.platform)
}
