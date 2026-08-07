import type { Locator, Page } from 'playwright'

import { pollUntilState } from './e2ePolling'

type CanvasMenuMotionState = 'closed' | 'closing' | 'open' | 'opening'

async function waitForCanvasMenuMotionState(
  menu: Locator,
  targetState: CanvasMenuMotionState
): Promise<void> {
  await pollUntilState({
    accept: (motionState) => motionState === targetState,
    description: `canvas menu motion state ${targetState}`,
    observe: () => menu.getAttribute('data-motion-state'),
    timeoutMs: 5_000
  })
}

export async function selectAgentProviderFromCreateMenu(
  page: Page,
  providerName: string
): Promise<void> {
  await page.getByRole('button', { name: '选择默认 Agent' }).click()
  const menu = page.getByRole('menu', { name: '选择默认 Agent' })
  const providerOption = menu.getByRole('menuitemradio', {
    name: providerName,
    exact: true
  })

  try {
    await menu.waitFor({ state: 'attached', timeout: 5_000 })
    await waitForCanvasMenuMotionState(menu, 'open')
    await providerOption.waitFor({ state: 'visible', timeout: 5_000 })
  } catch (error) {
    const visibleProviders = await page.getByRole('menuitemradio').allTextContents()
    const motionState = (await menu.count()) ? await menu.getAttribute('data-motion-state') : null
    throw new Error(
      `Provider "${providerName}" did not become selectable after the Agent menu settled. ` +
        `Motion state: ${JSON.stringify(motionState)}. ` +
        `Visible Providers: ${JSON.stringify(visibleProviders)}`,
      { cause: error }
    )
  }

  await providerOption.click({ timeout: 5_000 })
}
