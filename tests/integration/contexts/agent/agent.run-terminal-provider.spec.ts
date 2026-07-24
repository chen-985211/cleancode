import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { RunAgentTerminalRuntimeAdapter } from '../../../../src/contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'
import { asE2eTerminalInput, createE2ePrintCommand } from '../../../support/e2eTerminal'

describe('Agent Providers on the Run Agent terminal', () => {
  let directory: string
  let launchArtifactScopes: AgentLaunchArtifactScope[]
  let processes: NodePtyTerminalProcessAdapter
  let runtime: RunAgentTerminalRuntimeAdapter
  let sessions: TerminalSessionService

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-agent-run-'))
    launchArtifactScopes = []
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
    await Promise.all(launchArtifactScopes.map((scope) => scope.dispose()))
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
      detector: {
        inspect: async () => ({ providerId: 'codex', status: 'installed', version: 'test' })
      }
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
    await waitForShellReady(runtime, 'agent-session-1', () => output)
    const artifacts = new AgentLaunchArtifactScope()
    launchArtifactScopes.push(artifacts)
    const plan = await provider.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: (identified) => {
        sessionRef = identified
      },
      workspaceDirectory: directory
    })
    artifacts.seal()
    runtime.launch({
      onExit: (event) => resolveLaunchExit(event.exitCode),
      plan,
      sessionId: 'agent-session-1'
    })

    await expect(
      withTimeout(launchExited, () => `launch did not exit; output=${output}`)
    ).resolves.toBe(7)
    await waitUntil(() => sessionRef !== null)
    writeShellCommand(runtime, 'agent-session-1', createE2ePrintCommand('same-shell'))
    await waitUntil(() => output.includes('same-shell'))

    expect(terminalExited).toBe(false)
    expect(output).toContain('codex-through-run')
    expect(sessionRef).toEqual({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await sessions.detachView({ ...terminal.viewIdentity, viewId })
    await artifacts.dispose()
  }, 20_000)

  it('runs OpenCode and returns to the same shell without core special cases', async () => {
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
    await waitForShellReady(runtime, 'agent-session-opencode', () => output)
    const artifacts = new AgentLaunchArtifactScope()
    launchArtifactScopes.push(artifacts)
    const plan = await provider.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: vi.fn(),
      workspaceDirectory: directory
    })
    artifacts.seal()

    runtime.launch({
      onExit: (event) => resolveLaunchExit(event.exitCode),
      plan,
      sessionId: 'agent-session-opencode'
    })

    await expect(
      withTimeout(launchExited, () => `launch did not exit; output=${output}`)
    ).resolves.toBe(4)
    writeShellCommand(
      runtime,
      'agent-session-opencode',
      createE2ePrintCommand('opencode-same-shell')
    )
    await waitUntil(() => output.includes('opencode-same-shell'))
    expect(output).toContain(`opencode:${directory}`)
    expect(terminalExited).toBe(false)
    await sessions.detachView({ ...terminal.viewIdentity, viewId })
    await artifacts.dispose()
  }, 20_000)

  it('runs Claude Code through the same foreground launch and terminal contracts', async () => {
    const fakeClaude = join(directory, 'fake-claude.mjs')
    await writeFile(
      fakeClaude,
      [
        'const sessionIndex = process.argv.indexOf("--session-id")',
        'const sessionId = process.argv[sessionIndex + 1]',
        'process.stdout.write(`claude:${sessionId}:${process.cwd()}\\n`)',
        'process.exit(5)'
      ].join('\n')
    )
    const provider = new ClaudeCodeAgentProviderContribution({
      baseArgs: [fakeClaude],
      command: process.execPath,
      createSessionId: () => '550e8400-e29b-41d4-a716-446655440000',
      detector: {
        inspect: async () => ({ providerId: 'claude-code', status: 'installed', version: 'test' })
      }
    })
    let output = ''
    let terminalExited = false
    let resolveLaunchExit: (exitCode: number | null) => void = () => undefined
    const launchExited = new Promise<number | null>((resolve) => {
      resolveLaunchExit = resolve
    })
    const terminal = await runtime.open({
      agentId: 'agent-claude',
      columns: 88,
      gitBranch: null,
      onTerminalExit: () => {
        terminalExited = true
      },
      projectDirectory: directory,
      projectId: 'project-1',
      rows: 24,
      sessionId: 'agent-session-claude',
      terminalSourceTheme: 'dark',
      workspaceDirectory: directory,
      workspaceName: 'main'
    })
    const viewId = 'agent-view-claude'
    const snapshot = await sessions.attachView({
      ...terminal.viewIdentity,
      viewId,
      onOutput: (event) => {
        output += event.output.data
      }
    })
    output += snapshot.content
    await waitForShellReady(runtime, 'agent-session-claude', () => output)
    const artifacts = new AgentLaunchArtifactScope()
    launchArtifactScopes.push(artifacts)
    const plan = await provider.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: vi.fn(),
      workspaceDirectory: directory
    })
    artifacts.seal()

    runtime.launch({
      onExit: (event) => resolveLaunchExit(event.exitCode),
      plan,
      sessionId: 'agent-session-claude'
    })

    await expect(
      withTimeout(launchExited, () => `launch did not exit; output=${output}`)
    ).resolves.toBe(5)
    writeShellCommand(runtime, 'agent-session-claude', createE2ePrintCommand('claude-same-shell'))
    await waitUntil(() => output.includes('claude-same-shell'))
    expect(output).toContain(
      `claude:550e8400-e29b-41d4-a716-446655440000:${await realpath(directory)}`
    )
    expect(terminalExited).toBe(false)
    await sessions.detachView({ ...terminal.viewIdentity, viewId })
    await artifacts.dispose()
  }, 20_000)

  it('keeps the Agent terminal usable when termination fails and allows stop to retry', async () => {
    const sessionId = 'agent-session-stop-retry'
    await runtime.open({
      agentId: 'agent-stop-retry',
      columns: 88,
      gitBranch: null,
      onTerminalExit: vi.fn(),
      projectDirectory: directory,
      projectId: 'project-1',
      rows: 24,
      sessionId,
      terminalSourceTheme: 'dark',
      workspaceDirectory: directory,
      workspaceName: 'main'
    })
    const terminationFailure = new Error('simulated Agent terminal termination failure')
    const terminate = vi.spyOn(sessions, 'terminate').mockRejectedValueOnce(terminationFailure)

    await expect(runtime.stop(sessionId)).rejects.toBe(terminationFailure)

    expect(() => runtime.write(sessionId, '')).not.toThrow()
    expect(() => runtime.resize(sessionId, 100, 30)).not.toThrow()
    await expect(runtime.stop(sessionId)).resolves.toBeUndefined()
    expect(terminate).toHaveBeenCalledTimes(2)
    expect(() => runtime.write(sessionId, '')).toThrow(
      expect.objectContaining({ code: 'TERMINAL_SESSION_NOT_FOUND' })
    )
  })
})

async function waitForShellReady(
  runtime: RunAgentTerminalRuntimeAdapter,
  sessionId: string,
  readOutput: () => string
): Promise<void> {
  const marker = `shell-ready-${sessionId}`
  writeShellCommand(runtime, sessionId, createE2ePrintCommand(marker))
  await waitUntil(() => readOutput().includes(marker), 10_000)
}

function writeShellCommand(
  runtime: RunAgentTerminalRuntimeAdapter,
  sessionId: string,
  command: string
): void {
  runtime.write(sessionId, asE2eTerminalInput(command))
}

async function waitUntil(assertion: () => boolean, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now()
  while (!assertion()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for Agent terminal.')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function withTimeout<T>(promise: Promise<T>, message: () => string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message())), 10_000))
  ])
}
