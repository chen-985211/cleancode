import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, extname, join } from 'node:path'

import { createCodexAppServerProcessInvocation } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAppServerProcessInvocation'
import { inspectCodexThreadResumability } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexThreadResumabilityInspector'

const threadId = '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
const providerArgs = [
  '--config',
  'profile="dev"',
  '',
  'C:\\path with spaces\\',
  'literal "quote" & %PATH%'
]

describe('Codex persisted thread inspection', () => {
  let directory: string
  let query: Promise<unknown> | undefined
  beforeEach(async () => {
    query = undefined
    directory = await mkdtemp(join(tmpdir(), 'cleancode-codex-thread-read-'))
  })
  afterEach(async () => {
    // Even an assertion/test deadline must let the inspector finish owning its child processes.
    await query?.catch(() => undefined)
    await rm(directory, { recursive: true, force: true })
  })

  it.runIf(process.platform === 'win32')(
    'resolves a PATH command before opening native query pipes',
    async () => {
      const invocation = await createCodexAppServerProcessInvocation(
        basename(process.execPath, extname(process.execPath)),
        providerArgs,
        {
          environment: {
            PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`
          },
          workspaceDirectory: directory
        }
      )
      expect(await realpath(invocation.executable)).toBe(await realpath(process.execPath))
      expect(invocation.args).toEqual(providerArgs)
    }
  )

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
      const script = join(directory, 'app-server.mjs')
      const report = join(directory, 'request.json')
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
}).on('close', () => writeFileSync(process.env.REPORT_PATH + '.closed', 'closed'))
`
      )
      query = inspectCodexThreadResumability({
        appServerArgs: [script, ...providerArgs],
        environment: {
          CODEX_HOME: directory,
          REPORT_PATH: report,
          RESPONSE: JSON.stringify(response)
        },
        executable: process.execPath,
        threadId,
        workspaceDirectory: directory
      })
      expect(await query).toBe(expected)
      const observation = JSON.parse(await readFile(report, 'utf8')) as { cwd: string; pid: number }
      expect(observation).toMatchObject({
        args: [...providerArgs, 'app-server'],
        codexHome: directory,
        request: { method: 'thread/read', params: { threadId, includeTurns: false } }
      })
      expect(await realpath(observation.cwd)).toBe(await realpath(directory))
      expect(() => process.kill(observation.pid, 0)).toThrow()
      expect(await readFile(`${report}.closed`, 'utf8')).toBe('closed')
    },
    // Includes the production request deadline (7.5 s) and bounded cleanup (2.5 s).
    12_000
  )

  it('preserves the binding when the selected executable cannot start', async () => {
    query = inspectCodexThreadResumability({
      appServerArgs: [],
      environment: {},
      executable: join(tmpdir(), 'cleancode-missing-codex-executable'),
      threadId,
      workspaceDirectory: tmpdir()
    })
    expect(await query).toBe('unavailable')
  }, 12_000)
})
