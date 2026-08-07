import { realpath } from 'node:fs/promises'
import { delimiter } from 'node:path'

import type { Locator, Page } from 'playwright'
import { expect } from 'vitest'

import { pollUntilState } from './e2ePolling'

export const e2eShellReadyMarker = '__CLEANCODE_E2E_SHELL_READY__'

export function createE2eTerminalEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return process.platform === 'win32'
    ? { SHELL: 'powershell.exe', ...overrides }
    : { PS1: `${e2eShellReadyMarker} `, SHELL: '/bin/sh', ...overrides }
}

export function prependE2ePath(...directories: readonly string[]): string {
  return [...directories, process.env.PATH].filter(Boolean).join(delimiter)
}

export function createE2ePrintCommand(output: string): string {
  return createE2eNodeCommand(`process.stdout.write(${JSON.stringify(`${output}\n`)})`)
}

export function createE2eStreamingCommand(output: string, intervalMs: number): string {
  return createE2eNodeCommand(
    `setInterval(() => process.stdout.write(${JSON.stringify(`${output}\n`)}), ${intervalMs})`
  )
}

export function createE2eFileCommand(input: {
  readonly files: Readonly<Record<string, string>>
  readonly output?: string
}): string {
  return createE2eNodeCommand(
    [
      "const { writeFileSync } = require('node:fs')",
      ...Object.entries(input.files).map(
        ([path, contents]) =>
          `writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(contents)}, 'utf8')`
      ),
      input.output ? `process.stdout.write(${JSON.stringify(`${input.output}\n`)})` : undefined
    ]
      .filter(Boolean)
      .join(';')
  )
}

export function createE2eNodeCommand(source: string): string {
  const encodedSource = Buffer.from(source, 'utf8').toString('base64')
  const bootstrap = `eval(Buffer.from('${encodedSource}','base64').toString('utf8'))`

  return createTerminalInvocation(process.execPath, ['-e', bootstrap])
}

export function createE2eNodeScriptCommand(
  scriptPath: string,
  args: readonly string[] = [],
  options: { readonly replaceShell?: boolean } = {}
): string {
  return createTerminalInvocation(process.execPath, [scriptPath, ...args], options)
}

export function asE2eTerminalInput(command: string): string {
  return `${command}\r`
}

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
    ({ marker, terminalName, windows }) => {
      const output = Array.from(
        document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
      ).find((element) => element.getAttribute('aria-label') === `${terminalName} 文本输出`)
      const sessionId = output?.dataset.terminalSessionId
      const terminalText = output?.textContent?.trimEnd() ?? ''
      const promptReady = windows
        ? /PS [^\r\n>]*>/u.test(terminalText.slice(-4_096))
        : terminalText.endsWith(marker)

      return sessionId && promptReady ? sessionId : ''
    },
    { marker: e2eShellReadyMarker, terminalName, windows: process.platform === 'win32' }
  )

  return sessionIdHandle.jsonValue()
}

export async function waitForTerminalShellPrompt(page: Page, terminalName: string): Promise<void> {
  await waitForTerminalShellReady(page, terminalName)
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

  await pollUntilState({
    description: `terminal viewport geometry for session ${sessionId} to settle`,
    observe: async () => {
      const geometry = await readTerminalViewportGeometry(page, sessionId)

      if (!geometry) {
        previousGeometry = ''
        stableSamples = 0
        return { geometry, stable: false }
      }

      const currentGeometry = JSON.stringify(geometry)
      if (currentGeometry === previousGeometry) {
        stableSamples += 1
      } else {
        previousGeometry = currentGeometry
        stableSamples = 1
      }

      return { geometry, stable: stableSamples >= 2 }
    },
    accept: (observation) => observation.stable,
    intervalMs: 50,
    timeoutMs: 10_000
  })
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
  const metadataForm = page.getByRole('form', { name: '编辑终端信息' })
  const launchCommandInput = metadataForm.getByRole('textbox', { name: '启动命令' })

  await launchCommandInput.fill(launchCommand)
  await submitTerminalMetadataForm(metadataForm, terminalName)
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

export async function submitTerminalMetadataForm(
  metadataForm: Locator,
  terminalName: string
): Promise<void> {
  const saveAction = metadataForm.getByRole('button', { name: '保存终端信息' })
  await pollUntilState({
    description: `${terminalName} metadata save action to become enabled`,
    observe: () => saveAction.isEnabled(),
    accept: Boolean,
    intervalMs: 50,
    timeoutMs: 10_000
  })
  await metadataForm.evaluate((form) => {
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Terminal metadata editor is not a form.')
    }

    form.requestSubmit()
  })
  await metadataForm.waitFor({ state: 'detached' })
}

export async function expectTerminalWorkingDirectory(
  page: Page,
  terminalName: string,
  expectedDirectory: string
): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)
  const canonicalExpectedDirectory = await realpath(expectedDirectory)

  const workingDirectory = await pollUntilState({
    description: `terminal ${sessionId} working directory to become ${canonicalExpectedDirectory}`,
    observe: () =>
      page.evaluate(async (targetSessionId) => {
        const workingDirectories = await window.cleancode?.listTerminalWorkingDirectories({
          sessionIds: [targetSessionId]
        })

        return (
          workingDirectories?.find((entry) => entry.sessionId === targetSessionId)
            ?.workingDirectory ?? null
        )
      }, sessionId),
    accept: (currentDirectory) => currentDirectory === canonicalExpectedDirectory,
    intervalMs: 100,
    timeoutMs: 10_000
  })

  expect(workingDirectory).toBe(canonicalExpectedDirectory)
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

function quoteTerminalShellWord(value: string): string {
  return process.platform === 'win32'
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\"'\"'")}'`
}

function createTerminalInvocation(
  executable: string,
  args: readonly string[],
  options: { readonly replaceShell?: boolean } = {}
): string {
  const invocation = [executable, ...args].map(quoteTerminalShellWord).join(' ')
  if (process.platform === 'win32') return `& ${invocation}`
  return options.replaceShell ? `exec ${invocation}` : invocation
}
