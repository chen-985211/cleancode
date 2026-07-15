import { realpath } from 'node:fs/promises'

import type { Page } from 'playwright'
import { expect } from 'vitest'

export const e2eShellReadyMarker = '__CLEANCODE_E2E_SHELL_READY__'

export async function readTerminalSessionId(page: Page, terminalName: string): Promise<string> {
  const sessionIdHandle = await page.waitForFunction(
    (label) =>
      document
        .querySelector(`[aria-label="${label} 文本输出"]`)
        ?.getAttribute('data-terminal-session-id') ?? '',
    terminalName
  )

  return sessionIdHandle.jsonValue()
}

export async function waitForTerminalShellReady(page: Page, terminalName: string): Promise<void> {
  await waitForTerminalOutput(page, terminalName, e2eShellReadyMarker)
}

export async function waitForTerminalOutput(
  page: Page,
  terminalName: string,
  output: string
): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)

  await page.waitForFunction(
    ({ output, sessionId }) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-terminal-session-id]'))
        .find((element) => element.dataset.terminalSessionId === sessionId)
        ?.textContent?.includes(output) ?? false,
    { output, sessionId }
  )
}

export async function writeTerminalCommand(
  page: Page,
  terminalName: string,
  input: string
): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)

  await page.evaluate(
    ({ targetSessionId, input }) =>
      window.cleancode?.writeTerminal({ sessionId: targetSessionId, input }),
    { targetSessionId: sessionId, input }
  )
}

export async function configureAndStartTerminalLaunchCommand(
  page: Page,
  terminalName: string,
  launchCommand: string
): Promise<void> {
  const launchButtonName = `${terminalName} 启动命令`
  const previousSessionId = await readTerminalSessionId(page, terminalName)

  await page.getByRole('button', { name: launchButtonName }).click()
  const launchCommandInput = page.getByRole('textbox', { name: '启动命令' })

  await launchCommandInput.fill(launchCommand)
  await launchCommandInput.press('Enter')
  await page.waitForFunction(
    (buttonName) =>
      document
        .querySelector(`[aria-label="${buttonName}"]`)
        ?.getAttribute('data-launch-command-state') === 'configured',
    launchButtonName
  )
  await page.getByRole('button', { name: launchButtonName }).click()
  await page.waitForFunction(
    ({ previousSessionId, terminalName }) => {
      const currentSessionId = document
        .querySelector(`[aria-label="${terminalName} 文本输出"]`)
        ?.getAttribute('data-terminal-session-id')

      return Boolean(currentSessionId && currentSessionId !== previousSessionId)
    },
    { previousSessionId, terminalName }
  )
}

export async function expectTerminalWorkingDirectory(
  page: Page,
  terminalName: string,
  expectedDirectory: string
): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)
  const canonicalExpectedDirectory = await realpath(expectedDirectory)

  await expect
    .poll(
      () =>
        page.evaluate(async (targetSessionId) => {
          const workingDirectories = await window.cleancode?.listTerminalWorkingDirectories({
            sessionIds: [targetSessionId]
          })

          return (
            workingDirectories?.find((entry) => entry.sessionId === targetSessionId)
              ?.workingDirectory ?? null
          )
        }, sessionId),
      { interval: 100, timeout: 10_000 }
    )
    .toBe(canonicalExpectedDirectory)
}
