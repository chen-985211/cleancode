import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string

describe('Claude Code bundled hook runtime', () => {
  it('executes the structured hook through Electron in Node mode', async () => {
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
      const hook = settings.hooks.UserPromptSubmit[0]!.hooks[0]!

      expect(hook.command).toBe(electronExecutable)
      expect(hook.args).toEqual([expect.stringMatching(/relay\.mjs$/)])
      expect(plan.env.ELECTRON_RUN_AS_NODE).toBe('1')

      await executeHook(hook, plan.env, {
        cwd: process.cwd(),
        hook_event_name: 'UserPromptSubmit',
        session_id: '550e8400-e29b-41d4-a716-446655440000'
      })

      expect(identified).toHaveBeenCalledWith({
        formatVersion: 1,
        kind: 'claude-session',
        metadata: { confirmedBy: 'user-prompt-hook' },
        value: '550e8400-e29b-41d4-a716-446655440000'
      })
    } finally {
      await artifacts.dispose()
    }
  })
})

interface ClaudeHookSettings {
  readonly hooks: {
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
