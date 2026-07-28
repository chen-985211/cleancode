import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string

describe('Claude Code bundled hook runtime', () => {
  it('publishes only durable session identities through Electron in Node mode', async () => {
    const identified = vi.fn()
    const contribution = new ClaudeCodeAgentProviderContribution({
      detector: {
        inspect: async () => ({ providerId: 'claude-code', status: 'installed', version: 'test' })
      },
      runtimeExecutable: electronExecutable
    })
    const artifacts = new AgentLaunchArtifactScope()
    const plan = await contribution.launcher.createLaunchPlan({
      artifacts,
      onProviderSessionIdentified: identified,
      workspaceDirectory: process.cwd()
    })
    artifacts.seal()

    try {
      const settingsPath = plan.args[plan.args.indexOf('--settings') + 1]!
      const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeHookSettings
      const sessionStartHook = settings.hooks.SessionStart[0]!.hooks[0]!
      const userPromptHook = settings.hooks.UserPromptSubmit[0]!.hooks[0]!

      expect(sessionStartHook.command).toBe(electronExecutable)
      expect(sessionStartHook.args).toEqual([expect.stringMatching(/relay\.mjs$/)])
      expect(userPromptHook).toEqual(sessionStartHook)
      expect(plan.env.ELECTRON_RUN_AS_NODE).toBe('1')

      await executeHook(sessionStartHook, plan.env, {
        cwd: process.cwd(),
        hook_event_name: 'SessionStart',
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        source: 'startup'
      })
      expect(identified).not.toHaveBeenCalled()

      await executeHook(userPromptHook, plan.env, {
        cwd: process.cwd(),
        hook_event_name: 'UserPromptSubmit',
        session_id: '550e8400-e29b-41d4-a716-446655440000'
      })

      expect(identified).toHaveBeenCalledWith({
        formatVersion: 1,
        kind: 'claude-session',
        metadata: { confirmedBy: 'session-hook' },
        value: '550e8400-e29b-41d4-a716-446655440000'
      })

      await executeHook(sessionStartHook, plan.env, {
        cwd: process.cwd(),
        hook_event_name: 'SessionStart',
        session_id: '660e8400-e29b-41d4-a716-446655440001',
        source: 'resume'
      })
      expect(identified).toHaveBeenLastCalledWith({
        formatVersion: 1,
        kind: 'claude-session',
        metadata: { confirmedBy: 'session-hook' },
        value: '660e8400-e29b-41d4-a716-446655440001'
      })
      expect(identified).toHaveBeenCalledTimes(2)
    } finally {
      await artifacts.dispose()
    }
  })
})

interface ClaudeHookSettings {
  readonly hooks: {
    readonly SessionStart: readonly {
      readonly hooks: readonly {
        readonly args: readonly string[]
        readonly command: string
      }[]
    }[]
    readonly UserPromptSubmit: readonly {
      readonly hooks: readonly {
        readonly args: readonly string[]
        readonly command: string
      }[]
    }[]
  }
}

function executeHook(
  hook: { readonly args: readonly string[]; readonly command: string },
  environment: Readonly<Record<string, string>>,
  input: unknown
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      hook.command,
      [...hook.args],
      { env: { ...process.env, ...environment } },
      (error) => (error ? reject(error) : resolve())
    )
    child.stdin?.end(JSON.stringify(input))
  })
}
