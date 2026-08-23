// @vitest-environment node

import type { ElectronApplication } from 'playwright'

import {
  closeElectronApp,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'

describe('window state persistence e2e', () => {
  let electronApp: ElectronApplication
  let resources: E2eScenarioResources
  let workbench: E2eWorkbench

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-window-state-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench)
    resources.electronApp = electronApp
    resources.page = await electronApp.firstWindow()
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'restores the previous normal window size in a new application process',
    async () => {
      const expectedSize = { width: 1_100, height: 700 }
      const resized = await readMainWindowSizeAfterResize(electronApp, expectedSize)
      expect(resized).toEqual(expectedSize)

      await closeElectronApp(electronApp)
      resources.electronApp = undefined
      resources.page = undefined

      electronApp = await launchApp(workbench)
      resources.electronApp = electronApp
      resources.page = await electronApp.firstWindow()

      expect(await readMainWindowSize(electronApp)).toEqual(expectedSize)
    },
    electronScenarioTimeoutMs
  )
})

async function readMainWindowSizeAfterResize(
  electronApp: ElectronApplication,
  size: { readonly width: number; readonly height: number }
): Promise<{ readonly width: number; readonly height: number }> {
  return electronApp.evaluate(({ BrowserWindow }, expectedSize) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) throw new Error('Expected the main window to exist.')
    mainWindow.setSize(expectedSize.width, expectedSize.height)
    const [width, height] = mainWindow.getSize()
    return { width, height }
  }, size)
}

async function readMainWindowSize(
  electronApp: ElectronApplication
): Promise<{ readonly width: number; readonly height: number }> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) throw new Error('Expected the main window to exist.')
    const [width, height] = mainWindow.getSize()
    return { width, height }
  })
}
