import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { inspectCodexThreadResumability } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexThreadResumabilityInspector'

const threadId = '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'

describe('Codex persisted thread inspection', () => {
  it.each([
    { response: { result: { thread: { id: threadId } } }, expected: 'available' },
    {
      response: { error: { code: -32600, message: `thread not loaded: ${threadId}` } },
      expected: 'missing'
    },
    {
      response: { error: { code: -32600, message: `no rollout found for thread id ${threadId}` } },
      expected: 'missing'
    },
    { response: { error: { code: -32601, message: 'method not found' } }, expected: 'unavailable' },
    {
      response: { error: { code: -32600, message: 'thread not loaded: another-thread' } },
      expected: 'unavailable'
    },
    {
      response: { error: { code: -32603, message: `thread not loaded: ${threadId}` } },
      expected: 'unavailable'
    },
    { response: { result: { thread: { id: 'another-thread' } } }, expected: 'unavailable' },
    { response: { result: {} }, expected: 'unavailable' }
  ])(
    'classifies a metadata-only read as $expected for $response',
    async ({ response, expected }) => {
      const directory = await mkdtemp(join(tmpdir(), 'cleancode-codex-thread-read-'))
      const script = join(directory, 'app-server.mjs')
      const report = join(directory, 'request.json')
      try {
        await writeFile(
          script,
          `
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line)
  if (request.method === 'initialize') {
    process.stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\\n')
  } else if (request.method === 'thread/read') {
    writeFileSync(process.env.REPORT_PATH, JSON.stringify({
      args: process.argv.slice(2), cwd: process.cwd(), codexHome: process.env.CODEX_HOME,
      pid: process.pid, request
    }))
    process.stdout.write(JSON.stringify({ id: request.id, ...JSON.parse(process.env.RESPONSE) }) + '\\n')
  }
})
`
        )
        expect(
          await inspectCodexThreadResumability({
            appServerArgs: [script, '--config', 'profile="dev"'],
            environment: {
              CODEX_HOME: directory,
              REPORT_PATH: report,
              RESPONSE: JSON.stringify(response)
            },
            executable: process.execPath,
            threadId,
            workspaceDirectory: directory
          })
        ).toBe(expected)
        const observation = JSON.parse(await readFile(report, 'utf8')) as { pid: number }
        expect(observation).toMatchObject({
          args: ['--config', 'profile="dev"', 'app-server'],
          cwd: await realpath(directory),
          codexHome: directory,
          request: { method: 'thread/read', params: { threadId, includeTurns: false } }
        })
        await vi.waitFor(() => expect(() => process.kill(observation.pid, 0)).toThrow())
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it('preserves the binding when the selected executable cannot start', async () => {
    expect(
      await inspectCodexThreadResumability({
        appServerArgs: [],
        environment: {},
        executable: join(tmpdir(), 'cleancode-missing-codex-executable'),
        threadId,
        workspaceDirectory: tmpdir()
      })
    ).toBe('unavailable')
  })
})
