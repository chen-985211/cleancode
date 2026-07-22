import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RunAgentTerminalRuntimeAdapter } from '../../../../src/contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'

describe('Codex Provider on the Run Agent terminal', () => {
  let directory: string
  let processes: NodePtyTerminalProcessAdapter
  let runtime: RunAgentTerminalRuntimeAdapter
  let sessions: TerminalSessionService

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-agent-run-'))
    processes = new NodePtyTerminalProcessAdapter()
    sessions = new TerminalSessionService(
      processes,
      undefined,
      undefined,
      new HeadlessTerminalModelAdapter()
    )
    runtime = new RunAgentTerminalRuntimeAdapter(sessions)
  })

  afterEach(async () => {
    await runtime.disposeAll()
    await processes.disposeAll()
    await rm(directory, { force: true, recursive: true })
  })

  it('returns to the same shell after Codex exits and keeps structured session reporting', async () => {
    const fakeCodex = join(directory, 'fake-codex.mjs')
    await writeFile(
      fakeCodex,
      [
        'import { spawnSync } from "node:child_process"',
        'process.stdout.write("codex-through-run\\n")',
        'const notifyArg = process.argv.find((arg) => arg.startsWith("notify="))',
        'const notify = JSON.parse(notifyArg.slice("notify=".length))',
        'spawnSync(notify[0], [...notify.slice(1), JSON.stringify({',
        '  type: "agent-turn-complete",',
        '  "thread-id": "0190d8a1-8b7d-7d75-9f62-7a663ef87e33",',
        '  cwd: process.cwd()',
        '})], { env: process.env })',
        'process.exit(7)'
      ].join('\n')
    )
    const provider = new CodexAgentProviderContribution({
      baseArgs: [fakeCodex],
      command: process.execPath,
      detector: { inspect: async () => ({ status: 'installed', version: 'test' }) }
    })
    let output = ''
    let terminalExited = false
    let sessionRef: unknown = null
    let resolveLaunchExit: (exitCode: number | null) => void = () => undefined
    const launchExited = new Promise<number | null>((resolve) => {
      resolveLaunchExit = resolve
    })

    const terminal = await runtime.open({
      agentId: 'agent-1',
      columns: 88,
      gitBranch: null,
      onTerminalExit: () => {
        terminalExited = true
      },
      projectDirectory: directory,
      projectId: 'project-1',
      rows: 24,
      sessionId: 'agent-session-1',
      terminalSourceTheme: 'dark',
      workspaceDirectory: directory,
      workspaceName: 'main'
    })
    const viewId = 'agent-view-1'
    const snapshot = await sessions.attachView({
      ...terminal.viewIdentity,
      viewId,
      onOutput: (event) => {
        output += event.output.data
      }
    })
    output += snapshot.content
    const plan = await provider.launcher.createLaunchPlan({
      onProviderSessionIdentified: (identified) => {
        sessionRef = identified
      },
      workspaceDirectory: directory
    })
    runtime.launch({
      onExit: (event) => resolveLaunchExit(event.exitCode),
      plan,
      sessionId: 'agent-session-1'
    })

    await expect(
      withTimeout(launchExited, () => `launch did not exit; output=${output}`)
    ).resolves.toBe(7)
    await waitUntil(() => sessionRef !== null)
    runtime.write('agent-session-1', 'printf "same-shell\\n"\r')
    await waitUntil(() => output.includes('same-shell'))

    expect(terminalExited).toBe(false)
    expect(output).toContain('codex-through-run')
    expect(sessionRef).toEqual({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await sessions.detachView({ ...terminal.viewIdentity, viewId })
    await Promise.all(plan.temporaryArtifacts.map((artifact) => artifact.dispose()))
  }, 10_000)

  it('runs a minimum OpenCode Provider and returns to the same shell without core special cases', async () => {
    const fakeOpenCode = join(directory, 'fake-opencode.mjs')
    await writeFile(
      fakeOpenCode,
      'process.stdout.write(`opencode:${process.argv.at(-1)}\\n`); process.exit(4)'
    )
    const provider = new OpenCodeAgentProviderContribution({
      baseArgs: [fakeOpenCode],
      command: process.execPath,
      detector: {
        inspect: async () => ({ providerId: 'opencode', status: 'installed', version: 'test' })
      }
    })
    let output = ''
    let terminalExited = false
    let resolveLaunchExit: (exitCode: number | null) => void = () => undefined
    const launchExited = new Promise<number | null>((resolve) => {
      resolveLaunchExit = resolve
    })
    const terminal = await runtime.open({
      agentId: 'agent-opencode',
      columns: 88,
      gitBranch: null,
      onTerminalExit: () => {
        terminalExited = true
      },
      projectDirectory: directory,
      projectId: 'project-1',
      rows: 24,
      sessionId: 'agent-session-opencode',
      terminalSourceTheme: 'dark',
      workspaceDirectory: directory,
      workspaceName: 'main'
    })
    const viewId = 'agent-view-opencode'
    const snapshot = await sessions.attachView({
      ...terminal.viewIdentity,
      viewId,
      onOutput: (event) => {
        output += event.output.data
      }
    })
    output += snapshot.content
    const plan = await provider.launcher.createLaunchPlan({
      onProviderSessionIdentified: vi.fn(),
      workspaceDirectory: directory
    })

    runtime.launch({
      onExit: (event) => resolveLaunchExit(event.exitCode),
      plan,
      sessionId: 'agent-session-opencode'
    })

    await expect(
      withTimeout(launchExited, () => `launch did not exit; output=${output}`)
    ).resolves.toBe(4)
    runtime.write('agent-session-opencode', 'printf "opencode-same-shell\\n"\r')
    await waitUntil(() => output.includes('opencode-same-shell'))
    expect(output).toContain(`opencode:${directory}`)
    expect(terminalExited).toBe(false)
    await sessions.detachView({ ...terminal.viewIdentity, viewId })
  }, 10_000)
})

async function waitUntil(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!assertion()) {
    if (Date.now() - startedAt > 5_000) throw new Error('Timed out waiting for Agent terminal.')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function withTimeout<T>(promise: Promise<T>, message: () => string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message())), 4_000))
  ])
}
