import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import type { ApplicationUpdateSnapshot } from '../../../src/platform/ipc/applicationUpdateChannels'
import type {} from '../../fixtures/presentation/applicationUpdate'

let server: ViteDevServer
let baseUrl: string
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0, hmr: false }
  })
  await server.listen()
  baseUrl = server.resolvedUrls!.local[0]!
}, 30_000)
afterAll(async () => {
  await server?.close()
})

describe('application update Electron UI', () => {
  it.each(['light', 'dark'] as const)(
    'reserves the footer, centers confirmation, and preserves deferral in %s',
    async (theme) => {
      const directory = await mkdtemp(join(tmpdir(), 'cleancode-update-ui-'))
      const output = join(process.cwd(), 'test-results', 'application-update')
      await mkdir(output, { recursive: true })
      const env: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
      }
      const application = await electron.launch({
        args: [
          join(process.cwd(), 'tests', 'fixtures', 'platform', 'applicationUpdateWindow.mjs'),
          `--user-data-dir=${directory}`
        ],
        env
      })
      try {
        const page = await application.firstWindow()
        const publishUpdate = (value: ApplicationUpdateSnapshot) =>
          page.evaluate((snapshot) => {
            ;(
              window as unknown as {
                publishUpdate: (value: ApplicationUpdateSnapshot) => void
              }
            ).publishUpdate(snapshot)
          }, value)
        const windowState = await application.evaluate(({ BrowserWindow, screen }) => {
          const window = BrowserWindow.getAllWindows()[0]!
          return {
            visible: window.isVisible(),
            focused: window.isFocused(),
            outside:
              window.getBounds().x >=
              Math.max(...screen.getAllDisplays().map(({ bounds }) => bounds.x + bounds.width))
          }
        })
        expect(windowState).toEqual({ visible: true, focused: false, outside: true })
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(
          `${baseUrl}tests/fixtures/presentation/applicationUpdate.html?theme=${theme}&locale=${theme === 'dark' ? 'en' : 'zh-CN'}`
        )
        const progress = page.getByRole('progressbar')
        await progress.waitFor({ state: 'visible' })
        expect(await progress.getAttribute('aria-valuenow')).toBe('42')
        // The sidebar bottom band stays aligned with the canvas even without an update entry.
        await publishUpdate({
          revision: 2,
          status: 'unavailable',
          version: null,
          percent: null,
          unavailableReason: 'unsigned'
        })
        await page.locator('.application-update-control').waitFor({ state: 'detached' })
        expect(
          await page.evaluate(() => {
            const list = document.querySelector('.project-list')!.getBoundingClientRect()
            const bar = document.querySelector('.app-shell__statusbar')!.getBoundingClientRect()
            return list.bottom - bar.top
          })
        ).toBe(0)
        await page.screenshot({ path: join(output, `${theme}-unavailable.png`) })
        await publishUpdate({ revision: 3, status: 'idle', version: null, percent: null })
        await page.locator('.application-update-control').waitFor({ state: 'visible' })
        expect(await page.locator('.application-update-control').boundingBox()).toMatchObject({
          width: 26,
          height: 26
        })
        await publishUpdate({
          revision: 4,
          status: 'downloading',
          version: '0.2.0',
          percent: 42
        })
        await progress.waitFor({ state: 'visible' })
        await page.waitForFunction(
          () =>
            document.querySelector('.application-update-control')!.getBoundingClientRect().width ===
            64
        )
        const geometry = await page.evaluate(() => {
          const list = document.querySelector('.project-list')!
          const footer = document.querySelector('.application-update-footer')!
          const control = document.querySelector('.application-update-control')!
          const bar = document.querySelector('.app-shell__statusbar')!.getBoundingClientRect()
          const footerBounds = footer.getBoundingClientRect()
          return {
            listBottom: list.getBoundingClientRect().bottom,
            footerTop: footer.getBoundingClientRect().top,
            controlTop: control.getBoundingClientRect().top,
            controlHeight: control.getBoundingClientRect().height,
            reservedHeight: innerHeight - list.getBoundingClientRect().bottom,
            listPaddingBottom: parseFloat(getComputedStyle(list).paddingBottom),
            footerHeight: footerBounds.height,
            barHeight: bar.height,
            footerCenter: footerBounds.y + footerBounds.height / 2,
            barCenter: bar.y + bar.height / 2,
            scrolls: list.scrollHeight > list.clientHeight
          }
        })
        expect(geometry.scrolls).toBe(true)
        expect(geometry.listBottom).toBeLessThanOrEqual(geometry.footerTop)
        expect(geometry.controlTop - geometry.listBottom).toBe(4)
        expect(geometry.reservedHeight).toBe(geometry.barHeight + 4)
        expect(geometry.listPaddingBottom).toBe(6)
        expect(geometry.footerHeight).toBe(geometry.barHeight)
        expect(geometry.controlHeight).toBe(18)
        expect(geometry.controlTop + geometry.controlHeight / 2).toBe(geometry.barCenter)
        expect(Math.abs(geometry.footerCenter - geometry.barCenter)).toBeLessThanOrEqual(1)
        await page.screenshot({ path: join(output, `${theme}-download.png`) })
        const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
        await page.screenshot({
          path: join(output, `${theme}-bottom-alignment.png`),
          clip: { x: 0, y: viewport.height - 100, width: viewport.width, height: 100 }
        })
        await page
          .locator('.application-update-footer')
          .screenshot({ path: join(output, `${theme}-download-control.png`) })
        await progress.locator('..').focus()
        await publishUpdate({
          revision: 5,
          status: 'ready',
          version: '0.2.0',
          percent: 100
        })
        const dialog = page.getByRole('alertdialog')
        await dialog.waitFor({ state: 'visible' })
        // Reduced motion must keep the same final position and keyboard behavior.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.waitForFunction(() => {
          const dialog = document.querySelector('[role="alertdialog"]')!
          const bounds = dialog.getBoundingClientRect()
          return (
            ['none', 'blur(0px)'].includes(getComputedStyle(dialog).filter) &&
            getComputedStyle(dialog).opacity === '1' &&
            Math.abs(bounds.x + bounds.width / 2 - innerWidth / 2) < 2 &&
            Math.abs(bounds.y + bounds.height / 2 - innerHeight / 2) < 2
          )
        })
        await page.screenshot({ path: join(output, `${theme}-confirm.png`) })
        const later = dialog.getByRole('button', { name: theme === 'dark' ? 'Later' : '稍后' })
        await later.click()
        await dialog.waitFor({ state: 'hidden' })
        expect(
          await page.evaluate(
            () => (window as unknown as Window & { updateInstallCount: number }).updateInstallCount
          )
        ).toBe(0)
        await page
          .getByRole('button', {
            name: theme === 'dark' ? 'Restart and update' : '重启并更新',
            exact: true
          })
          .click()
        await dialog.waitFor({ state: 'visible' })
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.setContentSize(420, 480)
        )
        await page
          .getByRole('button', {
            name: theme === 'dark' ? 'Restart and update' : '重启并更新',
            exact: true
          })
          .click()
        await dialog.waitFor({ state: 'visible' })
        await page.waitForFunction(() => {
          const dialog = document.querySelector('[role="alertdialog"]')!
          return (
            ['none', 'blur(0px)'].includes(getComputedStyle(dialog).filter) &&
            getComputedStyle(dialog).opacity === '1'
          )
        })
        const bounds = await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(15)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(405)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480)
        await page.screenshot({ path: join(output, `${theme}-narrow.png`) })
        await dialog.locator('[data-update-install]').click()
        await page.waitForFunction(
          () =>
            (window as unknown as Window & { updateInstallCount: number }).updateInstallCount === 1
        )
        expect(errors).toEqual([])
      } finally {
        try {
          await application.close()
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      }
    },
    40_000
  )
})
