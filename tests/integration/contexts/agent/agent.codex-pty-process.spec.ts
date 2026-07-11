import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NodePtyCodexAgentProcessAdapter } from '../../../../src/contexts/agent/infrastructure/pty/NodePtyCodexAgentProcessAdapter'

describe('Codex agent PTY process adapter', () => {
  let workingDirectory: string
  let scriptPath: string
  let adapter: NodePtyCodexAgentProcessAdapter

  beforeEach(async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-pty-'))
    scriptPath = join(workingDirectory, 'fake-codex.mjs')
    await writeFile(
      scriptPath,
      [
        'import { spawnSync } from "node:child_process"',
        'process.stdout.write(JSON.stringify({',
        '  argv: process.argv.slice(2),',
        '  cwd: process.cwd(),',
        '  noProxy: process.env.NO_PROXY,',
        '  lowercaseNoProxy: process.env.no_proxy,',
        '  token: process.env.CLEANCODE_MCP_TOKEN',
        '}) + "\\n")',
        'const notifyArg = process.argv.find((arg) => arg.startsWith("notify="))',
        'if (notifyArg) {',
        '  const notify = JSON.parse(notifyArg.slice("notify=".length))',
        '  spawnSync(notify[0], [...notify.slice(1), JSON.stringify({',
        '    type: "agent-turn-complete",',
        '    "thread-id": "0190d8a1-8b7d-7d75-9f62-7a663ef87e33",',
        '    cwd: process.cwd()',
        '  })], { env: process.env })',
        '}',
        'process.stdin.on("data", (chunk) => process.stdout.write("INPUT:" + chunk.toString()))'
      ].join('\n')
    )
    adapter = new NodePtyCodexAgentProcessAdapter({
      baseArgs: [scriptPath],
      command: process.execPath
    })
  })

  afterEach(async () => {
    await adapter.disposeAll()
    await rm(workingDirectory, { recursive: true, force: true })
  })

  it('starts Codex in the workspace directory with MCP configuration and streams stdin/stdout', async () => {
    let output = ''
    let identifiedThreadId = ''
    const handle = await adapter.start({
      bearerToken: 'token-1',
      columns: 90,
      mcpServerUrl: 'http://127.0.0.1:43123/mcp',
      onCodexThreadIdentified: (threadId) => {
        identifiedThreadId = threadId
      },
      onExit: () => undefined,
      onOutput: (event) => {
        output += event.data
      },
      rows: 28,
      sessionId: 'agent-session-1',
      workspaceDirectory: workingDirectory
    })

    await waitUntil(() => output.includes('"argv"'))
    await waitUntil(() => Boolean(identifiedThreadId))
    adapter.write('agent-session-1', 'hello codex\r')
    await waitUntil(() => output.includes('INPUT:hello codex'))

    expect(handle.processId).toBeGreaterThan(0)
    expect(output).toContain(`"cwd":"${await realpath(workingDirectory)}"`)
    expect(output).toContain('"token":"token-1"')
    expect(output).toContain('127.0.0.1')
    expect(output).toContain('localhost')
    expect(output).toContain('::1')
    expect(output).toContain('--no-alt-screen')
    expect(output).toContain('-C')
    expect(output).toContain('--sandbox')
    expect(output).toContain('workspace-write')
    expect(output).toContain('--ask-for-approval')
    expect(output).toContain('on-request')
    expect(output).toContain('developer_instructions')
    expect(output).toContain('cleancode canvas')
    expect(output).toContain('.vscode/tasks.json')
    expect(output).toContain('mcp_servers.cleancode.url')
    expect(output).toContain('mcp_servers.cleancode.bearer_token_env_var')
    expect(output).toContain('mcp_servers.cleancode.default_tools_approval_mode')
    expect(output).toContain('approve')
    expect(identifiedThreadId).toBe('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
  }, 10_000)

  it('starts a persisted conversation with the exact Codex resume thread id', async () => {
    let output = ''

    await adapter.start({
      bearerToken: 'token-1',
      columns: 90,
      mcpServerUrl: 'http://127.0.0.1:43123/mcp',
      onCodexThreadIdentified: () => undefined,
      onExit: () => undefined,
      onOutput: (event) => {
        output += event.data
      },
      resumeThreadId: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33',
      rows: 28,
      sessionId: 'agent-session-resumed',
      workspaceDirectory: workingDirectory
    })

    await waitUntil(() => output.includes('"argv"'))

    expect(output).toContain('resume')
    expect(output).toContain('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
  })
})

async function waitUntil(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()

  while (!assertion()) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error('Timed out waiting for Codex PTY output.')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
