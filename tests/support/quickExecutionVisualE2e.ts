import type { Page } from 'playwright'

import { waitForWorkspaceInteractive } from './e2eSurfaceIsolation'

export async function selectTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.getByRole('button', { name: '主题设置' }).click()
  await page.getByText(theme === 'light' ? '浅色' : '深色', { exact: true }).click()
  await page.waitForFunction(
    (expectedTheme) => document.documentElement.dataset.theme === expectedTheme,
    theme
  )
  await page.getByRole('button', { name: '关闭主题设置' }).click()
  await page.locator('.theme-settings-backdrop').waitFor({ state: 'detached' })
  await waitForWorkspaceInteractive(page)
}

export async function waitForQuickExecutionVisualToSettle(page: Page): Promise<void> {
  await page.locator('[data-quick-execution-bar]').evaluate(async (bar) => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    await Promise.allSettled(
      bar.getAnimations({ subtree: true }).map((animation) => animation.finished)
    )
  })
}
