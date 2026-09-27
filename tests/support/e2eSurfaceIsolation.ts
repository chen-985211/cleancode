import type { Page } from 'playwright'

export async function waitForWorkspaceInteractive(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const workspace = document.querySelector('.app-shell__workspace')
    // Closed surfaces can remain mounted and inert; only the workspace's ancestry
    // determines whether a dismissed modal still blocks the next canvas action.
    return workspace !== null && workspace.closest('[inert]') === null
  })
}
