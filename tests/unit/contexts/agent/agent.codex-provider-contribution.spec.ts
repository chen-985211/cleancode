import { spawn } from 'node:child_process'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { createCodexSessionEndHookTrustConfiguration } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexSessionEndHookTrustResolver'
import { findUniqueCodexThreadIdByPrefix } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexThreadPrefixResolver'
import { CodexThreadIdentityReporter } from '../../../../src/contexts/agent/infrastructure/pty/CodexThreadIdentityReporter'
import { NodeAgentProviderCliDetector } from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderCliDetector'

describe('Codex Agent Provider contribution', () => {
  it('uses the shared cross-platform CLI detector by default', () => {
    const contribution = new CodexAgentProviderContribution()

    expect(contribution.detector).toBeInstanceOf(NodeAgentProviderCliDetector)
  })

  it('builds the existing resume, MCP, instruction, no-alt-screen and notify launch contract', async () => {
    const disposeTelemetry = vi.fn(async () => undefined)
    const contribution = new CodexAgentProviderContribution({
      detector: {
        inspect: async () => ({
          providerId: 'codex',
          status: 'installed',
          version: 'codex-cli 1.0.0'
        })
      },
      telemetryFactory: async () => ({
        dispose: disposeTelemetry,
        env: { CLEANCODE_CODEX_NOTIFY_TOKEN: 'notify-token' },
        notifyCommand: ['/usr/bin/node', '-e', 'reporter']
      })
    })

    const artifacts = new AgentLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      cleancodeMcp: {
        bearerToken: 'mcp-token',
        serverUrl: 'http://127.0.0.1:43123/mcp'
      },
      onProviderSessionIdentified: () => undefined,
      providerSessionRef: {
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
      },
      workspaceDirectory: '/repo/app'
    })
    artifacts.seal()

    try {
      expect(contribution.descriptor).toMatchObject({
        capabilities: {
          activityTracking: false,
          cleancodeMcp: true,
          launchInstructions: true,
          resume: true,
          sessionIdentityCapture: true,
          sessionRefCodec: true
        },
        icon: {
          paths: expect.arrayContaining([expect.objectContaining({ d: expect.any(String) })]),
          viewBox: '0 0 24 24'
        },
        id: 'codex'
      })
      expect(contribution).toHaveProperty('sessionRefCodec')
      expect(
        contribution.sessionRefCodec.parse({
          formatVersion: 1,
          kind: 'codex-thread',
          value: ' 0190d8a1-8b7d-7d75-9f62-7a663ef87e33 '
        })
      ).toEqual({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
      })
      expect(() =>
        contribution.sessionRefCodec.parse({
          formatVersion: 1,
          kind: 'claude-session',
          value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
        })
      ).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_INVALID' }))
      expect(() =>
        contribution.sessionRefCodec.parse({
          formatVersion: 1,
          kind: 'codex-thread',
          value: 'not-a-uuid'
        })
      ).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_INVALID' }))
      expect(plan.executable).toBe('codex')
      expect(plan.gracefulShutdown).toEqual({
        inputIntervalMs: 100,
        inputs: ['\x1b[27;1u', '\x15/quit', '\r', '\r'],
        timeoutMs: 1_800
      })
      expect(plan.args).toContain('--no-alt-screen')
      expect(plan.args).toEqual(
        expect.arrayContaining([
          'resume',
          '0190d8a1-8b7d-7d75-9f62-7a663ef87e33',
          '-C',
          '/repo/app'
        ])
      )
      expect(plan.args.join('\n')).toContain('mcp_servers.cleancode=')
      expect(plan.args.join('\n')).not.toContain('required=true')
      expect(plan.args.join('\n')).toContain('developer_instructions=')
      expect(plan.args.join('\n')).toContain('notify=')
      expect(plan.args).toEqual(
        expect.arrayContaining(['--config', 'tui.terminal_title=["thread-title","thread-id"]'])
      )
      expect(plan.env).toMatchObject({
        CLEANCODE_CODEX_NOTIFY_TOKEN: 'notify-token',
        CLEANCODE_MCP_TOKEN: 'mcp-token'
      })
      expect(plan.env.NO_PROXY?.split(',')).toEqual(
        expect.arrayContaining(['127.0.0.1', 'localhost', '::1'])
      )
      expect(plan.env.no_proxy).toBe(plan.env.NO_PROXY)
      expect(disposeTelemetry).not.toHaveBeenCalled()
    } finally {
      await artifacts.dispose()
    }
    expect(disposeTelemetry).toHaveBeenCalledOnce()
  })

  it('trusts only the discovered session-flags SessionEnd hook for the selected executable', async () => {
    const resolveHookTrust = vi.fn(async () => 'hooks.state={trusted-session-end-hook}')
    const contribution = new CodexAgentProviderContribution({
      command: '/default/codex',
      hookTrustResolver: resolveHookTrust,
      telemetryFactory: async () => ({
        dispose: async () => undefined,
        env: {
          CLEANCODE_CODEX_NOTIFY_TOKEN: 'notify-token',
          ELECTRON_RUN_AS_NODE: '1'
        },
        notifyCommand: ['/electron', '/tmp/relay.mjs'],
        sessionEndHook: {
          command: "'/electron' '/tmp/relay.mjs'",
          configuration: 'hooks.SessionEnd=[trusted-session-end-hook]'
        }
      })
    })
    const artifacts = new AgentLaunchArtifactScope()

    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      launchProfile: {
        arguments: [],
        environment: {},
        executable: '/selected/codex'
      },
      onProviderSessionIdentified: () => undefined,
      workspaceDirectory: '/repo/app'
    })
    artifacts.seal()

    try {
      expect(resolveHookTrust).toHaveBeenCalledWith({
        executable: '/selected/codex',
        hookCommand: "'/electron' '/tmp/relay.mjs'",
        hookConfiguration: 'hooks.SessionEnd=[trusted-session-end-hook]',
        workspaceDirectory: '/repo/app'
      })
      expect(plan.args).toEqual(
        expect.arrayContaining([
          '--config',
          'hooks.SessionEnd=[trusted-session-end-hook]',
          'hooks.state={trusted-session-end-hook}'
        ])
      )
      expect(plan.args.join('\n')).not.toContain('dangerously-bypass-hook-trust')
      expect(plan.env.ELECTRON_RUN_AS_NODE).toBe('1')
    } finally {
      await artifacts.dispose()
    }
  })

  it('falls back to legacy notify when Codex cannot identify the temporary hook', async () => {
    const contribution = new CodexAgentProviderContribution({
      hookTrustResolver: async () => {
        throw new Error('hooks/list unavailable')
      },
      telemetryFactory: async () => ({
        dispose: async () => undefined,
        env: {},
        notifyCommand: ['/electron', '/tmp/relay.mjs'],
        sessionEndHook: {
          command: "'/electron' '/tmp/relay.mjs'",
          configuration: 'hooks.SessionEnd=[temporary-hook]'
        }
      })
    })
    const artifacts = new AgentLaunchArtifactScope()

    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: () => undefined,
      workspaceDirectory: '/repo/app'
    })
    artifacts.seal()

    try {
      expect(plan.args.join('\n')).toContain('notify=')
      expect(plan.args.join('\n')).not.toContain('hooks.SessionEnd')
    } finally {
      await artifacts.dispose()
    }
  })

  it('selects exactly one matching untrusted session-flags hook and scopes its trusted hash', () => {
    const hook = {
      command: "'/electron' '/tmp/relay.mjs'",
      currentHash: 'sha256:abc123',
      eventName: 'sessionEnd',
      handlerType: 'command',
      isManaged: false,
      key: '/<session-flags>/config.toml:session_end:0:0',
      source: 'sessionFlags'
    }

    expect(
      createCodexSessionEndHookTrustConfiguration({ data: [{ hooks: [hook] }] }, hook.command)
    ).toBe(
      'hooks.state={"/<session-flags>/config.toml:session_end:0:0"={trusted_hash="sha256:abc123"}}'
    )
    expect(
      createCodexSessionEndHookTrustConfiguration(
        { data: [{ hooks: [hook, { ...hook }] }] },
        hook.command
      )
    ).toBeNull()
    expect(
      createCodexSessionEndHookTrustConfiguration(
        { data: [{ hooks: [{ ...hook, source: 'user' }] }] },
        hook.command
      )
    ).toBeNull()
  })

  it('relays both legacy argv notifications and SessionEnd stdin before the relay exits', async () => {
    const identified = vi.fn()
    const resolveHookTrust = vi.fn(async () => null)
    const contribution = new CodexAgentProviderContribution({
      hookTrustResolver: resolveHookTrust,
      runtimeExecutable: process.execPath
    })
    const artifacts = new AgentLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: identified,
      workspaceDirectory: process.cwd()
    })
    artifacts.seal()
    const notifyConfiguration = plan.args.find((argument) => argument.startsWith('notify='))
    expect(notifyConfiguration).toBeDefined()
    const notifyCommand = JSON.parse(notifyConfiguration!.slice('notify='.length)) as string[]
    expect(resolveHookTrust).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: 'codex',
        hookCommand: expect.stringContaining(process.execPath),
        hookConfiguration: expect.stringMatching(
          /^hooks\.SessionEnd=\[\{hooks=\[\{type="command",command=/
        )
      })
    )

    try {
      await runRelay(notifyCommand, plan.env, {
        argvPayload: JSON.stringify({
          cwd: '/a/different/workspace',
          'thread-id': '0190d8a1-8b7d-7d75-9f62-7a663ef87e33',
          type: 'agent-turn-complete'
        })
      })
      expect(identified).toHaveBeenLastCalledWith({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
      })

      await runRelay(notifyCommand, plan.env, {
        stdinPayload: JSON.stringify({
          cwd: '/another/historical/workspace',
          hook_event_name: 'SessionEnd',
          session_id: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
        })
      })
      expect(identified).toHaveBeenLastCalledWith({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
      })
    } finally {
      await artifacts.dispose()
    }
  })

  it('accepts only authenticated, formally shaped Codex session identities with valid UUIDs', async () => {
    const identified = vi.fn()
    const reporter = await CodexThreadIdentityReporter.start({
      onThreadIdentified: identified
    })

    try {
      await postCodexNotification(reporter, {
        cwd: '/historical/workspace',
        hook_event_name: 'SessionEnd',
        session_id: '0390d8a1-8b7d-7d75-9f62-7a663ef87e55'
      })
      await postCodexNotification(reporter, {
        cwd: process.cwd(),
        hook_event_name: 'SessionEnd',
        session_id: 'not-a-uuid'
      })
      await postCodexNotification(reporter, {
        cwd: process.cwd(),
        hook_event_name: 'SessionStart',
        session_id: '0490d8a1-8b7d-7d75-9f62-7a663ef87e66'
      })
      await postCodexNotification(reporter, {
        cwd: process.cwd(),
        'thread-id': 'not-a-uuid',
        type: 'agent-turn-complete'
      })

      expect(identified).toHaveBeenCalledOnce()
      expect(identified).toHaveBeenCalledWith('0390d8a1-8b7d-7d75-9f62-7a663ef87e55')
      const unauthorized = await fetch(reporter.url, { body: '{}', method: 'POST' })
      expect(unauthorized.status).toBe(401)
    } finally {
      await reporter.close()
    }
  })

  it('treats the structured terminal title as current and ignores an older SessionEnd', async () => {
    const activeThreadId = '0590d8a1-8b7d-7d75-9f62-7a663ef87e77'
    const olderThreadId = '0690d8a1-8b7d-7d75-9f62-7a663ef87e88'
    const identified = vi.fn()
    const resolveThreadIdPrefix = vi.fn(async () => activeThreadId)
    const reporter = await CodexThreadIdentityReporter.start({
      onThreadIdentified: identified,
      resolveThreadIdPrefix
    })

    try {
      reporter.acceptTerminalTitle(
        `renamed thread | containing separator | ${activeThreadId.slice(0, 29)}...`
      )
      await vi.waitFor(() => expect(identified).toHaveBeenCalledWith(activeThreadId))

      await postCodexNotification(reporter, {
        hook_event_name: 'SessionEnd',
        session_id: olderThreadId
      })

      expect(resolveThreadIdPrefix).toHaveBeenCalledWith(activeThreadId.slice(0, 29))
      expect(identified).toHaveBeenCalledTimes(1)
    } finally {
      await reporter.close()
    }
  })

  it('resolves a truncated title identity only from one exact thread/list prefix match', () => {
    const prefix = '0790d8a1-8b7d-7d75-9f62-7a663'
    const matchingThread = `${prefix}ef87e99`

    expect(
      findUniqueCodexThreadIdByPrefix(
        [
          { data: [{ id: '0890d8a1-8b7d-7d75-9f62-7a663ef87eaa' }], nextCursor: 'page-2' },
          { data: [{ id: matchingThread }], nextCursor: null }
        ],
        prefix
      )
    ).toBe(matchingThread)
    expect(findUniqueCodexThreadIdByPrefix([{ data: [], nextCursor: null }], prefix)).toBeNull()
    expect(
      findUniqueCodexThreadIdByPrefix(
        [
          {
            data: [{ id: matchingThread }, { id: `${prefix}ef87ebb` }],
            nextCursor: null
          }
        ],
        prefix
      )
    ).toBeNull()
  })
})

async function runRelay(
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  payload: { readonly argvPayload?: string; readonly stdinPayload?: string }
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      command[0]!,
      [...command.slice(1), ...(payload.argvPayload ? [payload.argvPayload] : [])],
      {
        env: { ...process.env, ...environment },
        stdio: ['pipe', 'ignore', 'pipe']
      }
    )
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Codex relay exited with ${String(code)}: ${stderr}`))
    })
    child.stdin.end(payload.stdinPayload)
  })
}

async function postCodexNotification(
  reporter: CodexThreadIdentityReporter,
  payload: Readonly<Record<string, unknown>>
): Promise<void> {
  await fetch(reporter.url, {
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${reporter.token}` },
    method: 'POST'
  })
}
