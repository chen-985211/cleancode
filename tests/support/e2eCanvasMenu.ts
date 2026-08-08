import type { Page } from 'playwright'

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
    await providerOption.click({ timeout: 5_000 })
  } catch (error) {
    const renderedProviders = await page.locator('[role="menuitemradio"]').allTextContents()
    const motionState = (await menu.count()) ? await menu.getAttribute('data-motion-state') : null
    throw new Error(
      `Provider "${providerName}" did not become actionable from the Agent menu. ` +
        `Motion state: ${JSON.stringify(motionState)}. ` +
        `Rendered Providers: ${JSON.stringify(renderedProviders)}`,
      { cause: error }
    )
  }
}
