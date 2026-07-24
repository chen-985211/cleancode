import { realpath } from 'node:fs/promises'

import type { Page } from 'playwright'
import { expect } from 'vitest'

export const e2eShellReadyMarker = '__CLEANCODE_E2E_SHELL_READY__'

export async function readTerminalSessionId(page: Page, terminalName: string): Promise<string> {
  const sessionIdHandle = await page.waitForFunction((label) => {
    const output = Array.from(
      document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
    ).find((element) => element.getAttribute('aria-label') === `${label} 文本输出`)

    return output?.dataset.terminalSessionId ?? ''
  }, terminalName)

  return sessionIdHandle.jsonValue()
}

export async function waitForTerminalShellReady(page: Page, terminalName: string): Promise<string> {
  const sessionIdHandle = await page.waitForFunction(
    ({ marker, terminalName }) => {
      const output = Array.from(
        document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
      ).find((element) => element.getAttribute('aria-label') === `${terminalName} 文本输出`)
      const sessionId = output?.dataset.terminalSessionId

      return sessionId && output?.textContent?.includes(marker) ? sessionId : ''
    },
    { marker: e2eShellReadyMarker, terminalName }
  )

  return sessionIdHandle.jsonValue()
}

export async function waitForTerminalOutput(
  page: Page,
  terminalName: string,
  output: string
): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)

  await waitForTerminalOutputBySessionId(page, sessionId, output)
}

async function waitForTerminalOutputBySessionId(
  page: Page,
  sessionId: string,
  output: string
): Promise<void> {
  await page.waitForFunction(
    ({ output, sessionId }) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-terminal-session-id]'))
        .find((element) => element.dataset.terminalSessionId === sessionId)
        ?.textContent?.includes(output) ?? false,
    { output, sessionId }
  )
}

export async function waitForTerminalOutputInNewSession(
  page: Page,
  terminalName: string,
  previousSessionId: string,
  output: string
): Promise<string> {
  const sessionIdHandle = await page.waitForFunction(
    ({ output, previousSessionId, terminalName }) => {
      const terminalOutput = Array.from(
        document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
      ).find((element) => element.getAttribute('aria-label') === `${terminalName} 文本输出`)
      const sessionId = terminalOutput?.dataset.terminalSessionId

      return sessionId &&
        sessionId !== previousSessionId &&
        terminalOutput?.textContent?.includes(output)
        ? sessionId
        : ''
    },
    { output, previousSessionId, terminalName }
  )

  return sessionIdHandle.jsonValue()
}

async function waitForTerminalSessionChange(
  page: Page,
  terminalName: string,
  previousSessionId: string
): Promise<string> {
  const sessionIdHandle = await page.waitForFunction(
    ({ previousSessionId, terminalName }) => {
      const terminalOutput = Array.from(
        document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
      ).find((element) => element.getAttribute('aria-label') === `${terminalName} 文本输出`)
      const sessionId = terminalOutput?.dataset.terminalSessionId

      return sessionId && sessionId !== previousSessionId ? sessionId : ''
    },
    { previousSessionId, terminalName }
  )

  return sessionIdHandle.jsonValue()
}

export async function waitForTerminalViewportGeometry(
  page: Page,
  sessionId: string
): Promise<void> {
  let previousGeometry = ''
  let stableSamples = 0

  await expect
    .poll(
      async () => {
        const geometry = await readTerminalViewportGeometry(page, sessionId)

        if (!geometry) {
          previousGeometry = ''
          stableSamples = 0
          return false
        }

        const currentGeometry = JSON.stringify(geometry)
        if (currentGeometry === previousGeometry) {
          stableSamples += 1
        } else {
          previousGeometry = currentGeometry
          stableSamples = 1
        }

        return stableSamples >= 2
      },
      {
        interval: 50,
        message: `Terminal viewport geometry for session ${sessionId} should settle`,
        timeout: 10_000
      }
    )
    .toBe(true)
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
): Promise<string> {
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

  return waitForTerminalSessionChange(page, terminalName, previousSessionId)
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

interface TerminalViewportGeometry {
  readonly node: readonly [number, number, number, number]
  readonly renderer: string
  readonly screen: readonly [number, number]
  readonly viewport: readonly [number, number, number, number]
}

async function readTerminalViewportGeometry(
  page: Page,
  sessionId: string
): Promise<TerminalViewportGeometry | null> {
  return page.evaluate((targetSessionId) => {
    const output = Array.from(
      document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
    ).find((element) => element.dataset.terminalSessionId === targetSessionId)
    const node = output?.closest<HTMLElement>('[data-terminal-block-id]')
    const viewport = node?.querySelector<HTMLElement>('.terminal-viewport')
    const screen = viewport?.querySelector<HTMLElement>('.xterm-screen')
    const textarea = viewport?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
    const renderer = viewport?.dataset.terminalRenderer

    if (!node || !viewport || !screen || !textarea || !renderer) {
      return null
    }

    const nodeRect = node.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    const screenRect = screen.getBoundingClientRect()
    const values = [
      nodeRect.x,
      nodeRect.y,
      nodeRect.width,
      nodeRect.height,
      viewportRect.x,
      viewportRect.y,
      viewportRect.width,
      viewportRect.height,
      screenRect.width,
      screenRect.height
    ]

    if (
      values.some((value) => !Number.isFinite(value)) ||
      nodeRect.width <= 0 ||
      nodeRect.height <= 0 ||
      viewportRect.width <= 0 ||
      viewportRect.height <= 0 ||
      screenRect.width <= 0 ||
      screenRect.height <= 0
    ) {
      return null
    }

    const round = (value: number): number => Math.round(value * 100) / 100

    return {
      node: [
        round(nodeRect.x),
        round(nodeRect.y),
        round(nodeRect.width),
        round(nodeRect.height)
      ] as const,
      renderer,
      screen: [round(screenRect.width), round(screenRect.height)] as const,
      viewport: [
        round(viewportRect.x),
        round(viewportRect.y),
        round(viewportRect.width),
        round(viewportRect.height)
      ] as const
    }
  }, sessionId)
}
