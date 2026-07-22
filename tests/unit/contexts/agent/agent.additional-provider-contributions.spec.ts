import { readFile } from 'node:fs/promises'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'
import { ClaudeCodeHookReporter } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeHookReporter'
import { OpenCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/opencode/OpenCodeAgentProviderContribution'
import {
  createAgentProviderCliProcessInvocation,
  NodeAgentProviderCliDetector
} from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderCliDetector'

const launchArtifactScopes: AgentLaunchArtifactScope[] = []

describe('additional Agent Provider contributions', () => {
  afterEach(async () => {
    await Promise.all(launchArtifactScopes.map((scope) => scope.dispose()))
    launchArtifactScopes.length = 0
  })

  it('contributes a Claude Code session-reference codec with resume support', () => {
    const contribution = new ClaudeCodeAgentProviderContribution({
      detector: createInstalledDetector('claude-code')
    })

    expect(contribution).toHaveProperty('sessionRefCodec')
    expect(
      contribution.sessionRefCodec.parse({
        formatVersion: 1,
        kind: 'claude-session',
        value: ' 550e8400-e29b-41d4-a716-446655440000 '
      })
    ).toEqual({
      formatVersion: 1,
      kind: 'claude-session',
      value: '550e8400-e29b-41d4-a716-446655440000'
    })
    expect(() =>
      contribution.sessionRefCodec.parse({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '550e8400-e29b-41d4-a716-446655440000'
      })
    ).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_INVALID' }))
  })

  it('detects an installed CLI and classifies a missing executable generically', async () => {
    const installed = new NodeAgentProviderCliDetector({
      executable: 'claude',
      installCommand: 'install claude',
      providerId: 'claude-code',
      runCommand: async () => ({ stderr: '', stdout: '2.1.0\n' })
    })
    const missing = new NodeAgentProviderCliDetector({
      executable: 'opencode',
      installCommand: 'install opencode',
      providerId: 'opencode',
      runCommand: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }
    })

    await expect(installed.inspect()).resolves.toEqual({
      providerId: 'claude-code',
      status: 'installed',
      version: '2.1.0'
    })
    await expect(missing.inspect()).resolves.toEqual({
      installCommand: 'install opencode',
      providerId: 'opencode',
      reason: 'not_found',
      status: 'missing',
      version: null
    })
  })

  it('detects Windows command shims through an injection-safe PowerShell invocation', () => {
    const executable = "agent'; Write-Output injected; #.cmd"
    const argument = "--flag='; Write-Output argument-injected; #"
    const invocation = createAgentProviderCliProcessInvocation(executable, [argument], 'win32')
    const encodedCommand = invocation.args.at(-1)

    expect(invocation.executable).toBe('powershell.exe')
    expect(invocation.args).toEqual(
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    )
    expect(encodedCommand).toBeDefined()
    const script = Buffer.from(encodedCommand!, 'base64').toString('utf16le')
    expect(script).toContain('& $cleancodeProviderExecutable @cleancodeProviderArguments')
    expect(script).toContain('CLEANCODE_PROVIDER_CLI_NOT_FOUND')
    expect(script).not.toContain(executable)
    expect(script).not.toContain(argument)
  })

  it('waits for a durable Claude Code hook before publishing resumable identity', async () => {
    const identified = vi.fn()
    const contribution = new ClaudeCodeAgentProviderContribution({
      createSessionId: () => '550e8400-e29b-41d4-a716-446655440000',
      detector: createInstalledDetector('claude-code')
    })

    const artifacts = createLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      cleancodeMcp: {
        bearerToken: 'secret-token',
        serverUrl: 'http://127.0.0.1:43121/mcp'
      },
      onProviderSessionIdentified: identified,
      workspaceDirectory: '/repo/worktree'
    })
    artifacts.seal()

    expect(plan.executable).toBe('claude')
    expect(plan.args).toEqual(
      expect.arrayContaining([
        '--session-id',
        '550e8400-e29b-41d4-a716-446655440000',
        '--mcp-config',
        expect.any(String),
        '--allowedTools',
        'mcp__cleancode__*',
        '--append-system-prompt',
        expect.stringContaining('CleanCode')
      ])
    )
    expect(plan.args).toEqual(expect.arrayContaining(['--settings', expect.any(String)]))
    expect(plan.args).not.toContain('--strict-mcp-config')
    expect(plan.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(plan.env.NO_PROXY?.split(',')).toEqual(
      expect.arrayContaining(['127.0.0.1', 'localhost', '::1'])
    )
    expect(plan.env.no_proxy).toBe(plan.env.NO_PROXY)
    expect(identified).not.toHaveBeenCalled()

    const userPromptHookRequest = {
      body: JSON.stringify({
        cwd: '/repo/worktree',
        hook_event_name: 'UserPromptSubmit',
        session_id: '550e8400-e29b-41d4-a716-446655440000'
      }),
      headers: { Authorization: `Bearer ${plan.env.CLEANCODE_CLAUDE_HOOK_TOKEN}` },
      method: 'POST' as const
    }
    await Promise.all([
      fetch(plan.env.CLEANCODE_CLAUDE_HOOK_URL!, userPromptHookRequest),
      fetch(plan.env.CLEANCODE_CLAUDE_HOOK_URL!, userPromptHookRequest)
    ])
    await vi.waitFor(() =>
      expect(identified).toHaveBeenCalledWith({
        formatVersion: 1,
        kind: 'claude-session',
        metadata: { confirmedBy: 'user-prompt-hook' },
        value: '550e8400-e29b-41d4-a716-446655440000'
      })
    )
    expect(identified).toHaveBeenCalledTimes(1)

    const configPath = plan.args[plan.args.indexOf('--mcp-config') + 1]!
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    expect(config).toMatchObject({
      mcpServers: {
        cleancode: {
          headers: { Authorization: 'Bearer ${CLEANCODE_MCP_TOKEN}' },
          type: 'http',
          url: 'http://127.0.0.1:43121/mcp'
        }
      }
    })
    expect(plan.env.CLEANCODE_MCP_TOKEN).toBe('secret-token')
    const settingsPath = plan.args[plan.args.indexOf('--settings') + 1]!
    const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as {
      readonly hooks: Readonly<Record<string, readonly { hooks: readonly unknown[] }[]>>
    }
    for (const handlers of Object.values(settings.hooks)) {
      expect(handlers[0]?.hooks[0]).toMatchObject({
        args: [expect.stringMatching(/relay\.mjs$/)],
        command: process.execPath,
        type: 'command'
      })
    }
    await artifacts.dispose()
    await expect(readFile(configPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('resumes only a validated Claude Code session reference', async () => {
    const contribution = new ClaudeCodeAgentProviderContribution({
      detector: createInstalledDetector('claude-code')
    })
    const artifacts = createLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: vi.fn(),
      providerSessionRef: {
        formatVersion: 1,
        kind: 'claude-session',
        value: '550e8400-e29b-41d4-a716-446655440000'
      },
      workspaceDirectory: '/repo/worktree'
    })
    artifacts.seal()

    expect(plan.args.slice(0, 2)).toEqual(['--resume', '550e8400-e29b-41d4-a716-446655440000'])
    expect(plan.args).toEqual(expect.arrayContaining(['--settings', expect.any(String)]))
    await artifacts.dispose()
  })

  it('accepts authenticated Claude Hooks only from the launch workspace', async () => {
    const onActivityChanged = vi.fn()
    const onSessionIdentified = vi.fn()
    const reporter = await ClaudeCodeHookReporter.start({
      onActivityChanged,
      onSessionIdentified,
      workspaceDirectory: process.cwd()
    })
    try {
      await fetch(reporter.url, {
        body: JSON.stringify({
          cwd: process.cwd(),
          hook_event_name: 'SessionStart',
          session_id: '550e8400-e29b-41d4-a716-446655440000'
        }),
        headers: { Authorization: `Bearer ${reporter.token}` },
        method: 'POST'
      })
      await fetch(reporter.url, {
        body: JSON.stringify({
          cwd: process.cwd(),
          hook_event_name: 'PermissionRequest',
          session_id: '550e8400-e29b-41d4-a716-446655440000'
        }),
        headers: { Authorization: `Bearer ${reporter.token}` },
        method: 'POST'
      })
      await vi.waitFor(() => expect(onActivityChanged).toHaveBeenCalledWith('idle'))
      expect(onSessionIdentified).not.toHaveBeenCalled()
      await fetch(reporter.url, {
        body: JSON.stringify({
          cwd: process.cwd(),
          hook_event_name: 'UserPromptSubmit',
          session_id: '550e8400-e29b-41d4-a716-446655440000'
        }),
        headers: { Authorization: `Bearer ${reporter.token}` },
        method: 'POST'
      })
      await vi.waitFor(() =>
        expect(onSessionIdentified).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
      )
      expect(onActivityChanged).toHaveBeenCalledWith('idle')
      expect(onActivityChanged).toHaveBeenCalledWith('working')
      expect(onActivityChanged).toHaveBeenCalledWith('waiting_approval')

      const unauthorized = await fetch(reporter.url, {
        body: '{}',
        method: 'POST'
      })
      expect(unauthorized.status).toBe(401)
    } finally {
      await reporter.dispose()
    }
  })

  it('adds OpenCode through the unified Provider contracts', async () => {
    const contribution = new OpenCodeAgentProviderContribution({
      detector: createInstalledDetector('opencode')
    })
    const artifacts = createLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: vi.fn(),
      workspaceDirectory: process.cwd()
    })
    artifacts.seal()

    try {
      expect(contribution.descriptor).toEqual({
        capabilities: {
          activityTracking: true,
          cleancodeMcp: 'best_effort',
          launchInstructions: true,
          resume: true,
          sessionIdentityCapture: true,
          sessionRefCodec: true
        },
        displayName: 'OpenCode',
        id: 'opencode'
      })
      expect(contribution).toMatchObject({
        cleancodeCapability: expect.any(Object),
        resume: expect.any(Object),
        sessionRefCodec: expect.any(Object),
        telemetry: expect.any(Object)
      })
      expect(plan.args).toEqual([process.cwd()])
      expect(plan.env).toMatchObject({
        CLEANCODE_OPENCODE_REPORTER_TOKEN: expect.any(String),
        CLEANCODE_OPENCODE_REPORTER_URL: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/),
        OPENCODE_CONFIG_CONTENT: expect.any(String)
      })
      expect(plan.executable).toBe('opencode')
      expect(artifacts.isDisposed).toBe(false)
    } finally {
      await artifacts.dispose()
    }
  })
})

function createInstalledDetector(providerId: string) {
  return {
    inspect: async () => ({
      providerId,
      status: 'installed' as const,
      version: 'test'
    })
  }
}

function createLaunchArtifactScope(): AgentLaunchArtifactScope {
  const scope = new AgentLaunchArtifactScope()
  launchArtifactScopes.push(scope)
  return scope
}
