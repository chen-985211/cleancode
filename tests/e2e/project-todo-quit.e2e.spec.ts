// @vitest-environment node
import { once } from 'node:events'
import {
  createE2eWorkbench,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  teardownE2eScenario,
  waitForJsonFile,
  type E2eScenarioResources
} from '../support/e2eWorkbench'

it(
  'persists edits that arrive while the Electron window is closing',
  async ({ task }) => {
    const workbench = await createE2eWorkbench('cleancode-todo-quit')
    const resources: E2eScenarioResources = { workbench }
    onTestFinished(() =>
      teardownE2eScenario({
        resources,
        taskFailed: task.result?.state === 'fail',
        taskName: task.name
      })
    )
    const app = await launchApp(workbench)
    resources.electronApp = app
    const page = await app.firstWindow()
    resources.page = page
    await expectDesktopRuntime(page)
    await page.getByRole('button', { name: '添加项目', exact: true }).click()
    await page.getByRole('button', { name: '打开待办清单' }).click()
    await page.getByRole('button', { name: '记一条' }).click()
    const title = page.getByRole('textbox', { name: '待办内容' })
    await title.fill('initial')
    await waitForJsonFile(workbench.appStateDirectory, 'list.json')
    // Two inputs in the same turn guarantee the last one is still behind an unacknowledged save.
    await title.evaluate((el: HTMLTextAreaElement) => {
      window.addEventListener(
        'beforeunload',
        () => {
          const setValue = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value'
          )!.set!
          for (const text of ['first edit', 'last edit']) {
            setValue.call(el, text)
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
        },
        { capture: true, once: true }
      )
    })
    const exited = once(app.process(), 'exit')
    await app.evaluate(({ app }) => {
      setImmediate(() => app.quit())
    })
    await exited
    resources.electronApp = undefined
    resources.page = undefined
    expect(
      JSON.parse(await readOnlyJsonFile(workbench.appStateDirectory, 'list.json')).items
    ).toMatchObject([{ text: 'last edit' }])
  },
  electronScenarioTimeoutMs
)
