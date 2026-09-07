import { execFile } from 'node:child_process'
import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import {
  agentInboxWakeupPrompt,
  type AgentMessageDeliveryState,
  type AgentMessageWakeupPort
} from '../../../../src/contexts/agent/application/ports/AgentMessageDeliveryPort'
import { AgentMessageMailbox } from '../../../../src/contexts/agent/application/services/AgentMessageMailbox'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'

describe('Claude native inbox wakeup', () => {
  it('preserves user settings and hooks while adding the inbox watcher', async () => {
    const artifacts = new AgentLaunchArtifactScope()
    const userSettings = {
      permissions: { defaultMode: 'plan' },
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'user-hook' }] }],
        FileChanged: [{ matcher: '.env', hooks: [{ type: 'command', command: 'user-file-hook' }] }]
      }
    }
    const plan = await new ClaudeCodeAgentProviderContribution().launcher.createLaunchPlan({
      artifacts,
      workspaceDirectory: process.cwd(),
      providerVersion: '2.1.139',
      launchProfile: {
        executable: 'claude-custom',
        arguments: ['--settings', JSON.stringify(userSettings), '--permission-mode', 'plan'],
        environment: {}
      },
      messageDelivery: () => undefined,
      onProviderSessionIdentified: () => undefined
    })
    artifacts.seal()
    try {
      expect(plan.args.filter((arg) => arg === '--settings')).toHaveLength(1)
      const merged = JSON.parse(
        await readFile(plan.args[plan.args.indexOf('--settings') + 1]!, 'utf8')
      )
      expect(merged.permissions).toEqual(userSettings.permissions)
      expect(merged.hooks.SessionStart).toContainEqual(userSettings.hooks.SessionStart[0])
      expect(merged.hooks.FileChanged).toContainEqual(userSettings.hooks.FileChanged[0])
      expect(plan.args).toEqual(expect.arrayContaining(['--permission-mode', 'plan']))
      expect(plan.executable).toBe('claude-custom')
    } finally {
      await artifacts.dispose()
    }
  })

  it.each(['2.1.139 (Claude Code)', undefined])(
    'acknowledges the current notification after a native hook handshake, version=%s',
    async (providerVersion) => {
      const artifacts = new AgentLaunchArtifactScope()
      const mailbox = new AgentMessageMailbox()
      const identity = { agentId: 'reviewer', projectId: 'project', workspaceId: 'workspace' }
      let state: AgentMessageDeliveryState = { running: true, mcpReady: true, activity: 'idle' }
      const delivery = mailbox.registerDelivery(identity, () => state)
      let wakeup: AgentMessageWakeupPort | null | undefined
      const identified = vi.fn()
      const provider = new ClaudeCodeAgentProviderContribution()
      const plan = await provider.launcher.createLaunchPlan({
        artifacts,
        workspaceDirectory: process.cwd(),
        providerVersion,
        cleancodeMcp: { bearerToken: 'test-token', serverUrl: 'http://127.0.0.1:1/mcp' },
        messageDelivery: (value) => {
          wakeup = value
          delivery.setWakeup(value)
        },
        onActivityChanged: (activity) => {
          state = { ...state, activity }
          delivery.refresh()
        },
        onProviderSessionIdentified: identified
      })
      artifacts.seal()
      try {
        const settings = JSON.parse(
          await readFile(plan.args[plan.args.indexOf('--settings') + 1]!, 'utf8')
        )
        const hook = settings.hooks.FileChanged.find(
          (group: { matcher?: string }) => !group.matcher
        ).hooks[0]
        const signalPath = settings.hooks.FileChanged.find(
          (group: { matcher?: string }) => group.matcher
        ).matcher
        const session = { cwd: process.cwd(), session_id: '550e8400-e29b-41d4-a716-446655440000' }
        expect(signalPath.startsWith(process.cwd())).toBe(false)
        expect(hook.asyncRewake).toBe(true)
        const start = await runHook(settings.hooks.SessionStart[0].hooks[0], plan.env, {
          ...session,
          hook_event_name: 'SessionStart',
          source: 'startup'
        })
        expect(start.stdout).not.toContain('watchPaths')
        expect(wakeup).toBeTruthy()
        await runHook(settings.hooks.Notification[0].hooks[0], plan.env, {
          ...session,
          hook_event_name: 'Notification',
          notification_type: 'idle_prompt'
        })
        expect(state.activity).toBe('waiting_input')
        mailbox.send(
          { ...identity, agentId: 'writer', sessionId: 'writer-session' },
          {
            messageId: 'task-1',
            toAgentId: identity.agentId,
            kind: 'task',
            text: 'Review this revision.'
          }
        )
        const notification = delivery.settle()
        void notification.catch(() => undefined)
        const changed = {
          ...session,
          hook_event_name: 'FileChanged',
          file_path: signalPath,
          event: 'change'
        }
        const seedHook = settings.hooks.FileChanged.find(
          (group: { matcher?: string }) => group.matcher
        ).hooks[0]
        expect((await runHook(seedHook, plan.env, changed)).stderr).toBe('')
        const foreign = await runHook(hook, plan.env, { ...changed, agent_id: 'subagent' })
        expect(foreign.stderr).toBe('')
        // A native watcher may debounce until writes settle; retrying the file write
        // inside one notification attempt must not starve that quiet interval.
        const result = await new Promise<Awaited<ReturnType<typeof runHook>>>((resolve, reject) => {
          let quiet: ReturnType<typeof setTimeout>
          const onChange = () => {
            clearTimeout(quiet)
            quiet = setTimeout(() => {
              watcher.close()
              clearTimeout(deadline)
              void runHook(hook, plan.env, changed).then(resolve, reject)
            }, 750)
          }
          const watcher = watch(signalPath, onChange)
          const deadline = setTimeout(() => {
            watcher.close()
            clearTimeout(quiet)
            reject(new Error('Native watcher never observed a quiet notification file'))
          }, 2_500)
          onChange()
        })
        await notification
        expect(result).toMatchObject({ code: 2, stderr: agentInboxWakeupPrompt })
        expect((await runHook(hook, plan.env, changed)).stderr).toBe('')
        await runHook(settings.hooks.PreToolUse[0].hooks[0], plan.env, {
          ...session,
          hook_event_name: 'PreToolUse'
        })
        expect(identified).toHaveBeenCalledWith(
          expect.objectContaining({ value: session.session_id })
        )

        const abort = new AbortController()
        const cancelled = wakeup!.notify({ notificationId: 'task-2', signal: abort.signal })
        abort.abort()
        await expect(cancelled).rejects.toThrow()
        expect((await runHook(hook, plan.env, changed)).stderr).toBe('')
      } finally {
        await delivery.dispose()
        await artifacts.dispose()
      }
    }
  )
})

function runHook(
  hook: { command: string; args: string[] },
  env: Readonly<Record<string, string>>,
  input: unknown
) {
  return new Promise<{ code: number | string; stdout: string; stderr: string }>((resolve) => {
    const child = execFile(
      hook.command,
      hook.args,
      { env: { ...process.env, ...env }, timeout: 5_000 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
    child.stdin?.end(JSON.stringify(input))
  })
}
