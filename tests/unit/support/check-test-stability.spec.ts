import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collectTestStabilityViolations } from '../../../scripts/check-test-stability.mjs'

describe('test stability quality gate', () => {
  it('rejects fixed waits, raw sleeps, configured retries, and action retry loops', async () => {
    const directory = await createFixtureRepository()

    try {
      await writeSourceFile(
        directory,
        'tests/e2e/Bad.e2e.spec.ts',
        [
          "import { launchApp } from '../support/e2eWorkbench'",
          'await page.waitForTimeout(1_000)',
          'await new Promise((resolve) => setTimeout(resolve, 500))',
          'await expect.poll(() => readReportCount()).toBe(3)',
          'await vi.waitUntil(() => readRuntime())',
          'for (const delayMs of [0, 500]) {',
          '  try {',
          '    const app = await launchApp()',
          '    return app',
          '  } catch {',
          '    continue',
          '  }',
          '}',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'tests/support/BadSupport.ts',
        [
          'export async function sleep() {',
          '  await new Promise((resolve) => setTimeout(resolve, 50))',
          '}',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'tests/e2e/PromisedTimer.e2e.spec.ts',
        ["import { setTimeout as sleep } from 'node:timers/promises'", 'await sleep(500)', ''].join(
          '\n'
        )
      )
      await writeSourceFile(
        directory,
        'tests/fixtures/BadFixture.ts',
        [
          'export async function waitForFixture() {',
          '  await new Promise((resolve) => setTimeout(resolve, 50))',
          '}',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'vitest.e2e.config.ts',
        ['export default {', '  test: { retry: 2 }', '}', ''].join('\n')
      )

      expect(collectTestStabilityViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'tests/e2e/Bad.e2e.spec.ts',
          line: 2,
          rule: 'no-fixed-time-wait'
        }),
        expect.objectContaining({
          filePath: 'tests/e2e/Bad.e2e.spec.ts',
          line: 3,
          rule: 'no-raw-test-sleep'
        }),
        expect.objectContaining({
          filePath: 'tests/e2e/Bad.e2e.spec.ts',
          line: 4,
          rule: 'no-direct-state-poll'
        }),
        expect.objectContaining({
          filePath: 'tests/e2e/Bad.e2e.spec.ts',
          line: 5,
          rule: 'no-direct-state-poll'
        }),
        expect.objectContaining({
          filePath: 'tests/e2e/Bad.e2e.spec.ts',
          line: 6,
          rule: 'no-action-retry-loop'
        }),
        expect.objectContaining({
          filePath: 'tests/e2e/PromisedTimer.e2e.spec.ts',
          line: 2,
          rule: 'no-raw-test-sleep'
        }),
        expect.objectContaining({
          filePath: 'tests/fixtures/BadFixture.ts',
          line: 2,
          rule: 'no-raw-test-sleep'
        }),
        expect.objectContaining({
          filePath: 'tests/support/BadSupport.ts',
          line: 2,
          rule: 'no-raw-test-sleep'
        }),
        expect.objectContaining({
          filePath: 'vitest.e2e.config.ts',
          line: 2,
          rule: 'no-test-retry'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows state-driven polling and deadline timers owned by the approved support primitive', async () => {
    const directory = await createFixtureRepository()

    try {
      await writeSourceFile(
        directory,
        'tests/e2e/Good.e2e.spec.ts',
        [
          "import { pollUntilState } from '../support/e2ePolling'",
          'await pollUntilState({',
          "  description: 'terminal becomes ready',",
          '  observe: () => readTerminalRuntime(sessionId),',
          "  accept: (runtime) => runtime.status === 'ready',",
          '  timeoutMs: 10_000',
          '})',
          'await expect(page.getByRole("status")).toHaveText("ready")',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'tests/support/e2ePolling.ts',
        [
          'export async function pollUntilState() {',
          '  await new Promise((resolve) => setTimeout(resolve, 50))',
          '}',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'tests/support/e2eRuntimeEvent.ts',
        [
          'export function waitForRuntimeEvent() {',
          '  return new Promise((resolve, reject) => {',
          "    const timeout = window.setTimeout(() => reject(new Error('deadline')), 5_000)",
          '    subscribe((event) => {',
          '      window.clearTimeout(timeout)',
          '      resolve(event)',
          '    })',
          '  })',
          '}',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'tests/e2e/Observation.e2e.spec.ts',
        [
          'while (Date.now() < deadline) {',
          '  try {',
          '    const graph = await readGraph()',
          '    if (predicate(graph)) return graph',
          '  } catch {',
          '    continue',
          '  }',
          '}',
          ''
        ].join('\n')
      )

      expect(collectTestStabilityViolations({ cwd: directory })).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

async function createFixtureRepository(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cleancode-test-stability-'))
}

async function writeSourceFile(
  directory: string,
  filePath: string,
  content: string
): Promise<void> {
  const absolutePath = join(directory, filePath)
  await mkdir(join(absolutePath, '..'), { recursive: true })
  await writeFile(absolutePath, content)
}
