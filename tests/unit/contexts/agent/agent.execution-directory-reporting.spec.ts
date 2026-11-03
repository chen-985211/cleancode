import { ClaudeCodeHookReporter } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeHookReporter'
import { CodexThreadIdentityReporter } from '../../../../src/contexts/agent/infrastructure/pty/CodexThreadIdentityReporter'

const first = '0190d8a1-8b7d-4d75-9f62-7a663ef87e33'
const second = '0290d8a1-8b7d-4d75-9f62-7a663ef87e44'
const directory = '/repo/worktrees/feature'

async function post(reporter: { url: string; token: string }, payload: Record<string, unknown>) {
  const response = await fetch(reporter.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${reporter.token}` },
    body: JSON.stringify(payload)
  })
  expect(response.status).toBe(204)
}

describe('Provider execution directory reports', () => {
  it('accepts a native Claude worktree change but ignores subagents and old conversations', async () => {
    const changed = vi.fn(async () => true)
    const identified = vi.fn()
    const reporter = await ClaudeCodeHookReporter.start({
      workspaceDirectory: '/repo/main',
      onActivityChanged: vi.fn(),
      onSessionIdentified: identified,
      onExecutionDirectoryChanged: changed
    })
    try {
      await post(reporter, {
        cwd: directory,
        hook_event_name: 'SessionStart',
        source: 'resume',
        session_id: first
      })
      await post(reporter, { cwd: directory, hook_event_name: 'PreToolUse', session_id: first })
      expect(changed).toHaveBeenCalledWith(directory)
      expect(identified).toHaveBeenCalledExactlyOnceWith(first)
      changed.mockClear()
      await post(reporter, { cwd: '/repo/old', hook_event_name: 'PreToolUse', session_id: second })
      await post(reporter, {
        cwd: '/repo/subagent',
        hook_event_name: 'PreToolUse',
        session_id: first,
        agent_id: 'child'
      })
      expect(changed).not.toHaveBeenCalled()
    } finally {
      await reporter.dispose()
    }
  })

  it('keeps the Claude conversation when a reported directory is rejected', async () => {
    const changed = vi.fn(async (cwd: string) => cwd === directory)
    const identified = vi.fn()
    const reporter = await ClaudeCodeHookReporter.start({
      workspaceDirectory: '/repo/main',
      onActivityChanged: vi.fn(),
      onSessionIdentified: identified,
      onExecutionDirectoryChanged: changed
    })
    try {
      await post(reporter, {
        cwd: directory,
        hook_event_name: 'SessionStart',
        source: 'resume',
        session_id: first
      })
      await post(reporter, {
        cwd: '/unrelated',
        hook_event_name: 'SessionStart',
        source: 'resume',
        session_id: second
      })
      await post(reporter, { cwd: directory, hook_event_name: 'PreToolUse', session_id: first })
      expect(identified).toHaveBeenCalledExactlyOnceWith(first)
    } finally {
      await reporter.dispose()
    }
  })

  it('uses Codex notification cwd only for the active thread and rechecks after async validation', async () => {
    let release: () => void = () => undefined
    const pending = new Promise<boolean>((resolve) => {
      release = () => resolve(true)
    })
    const changed = vi
      .fn()
      .mockResolvedValue(true)
      .mockImplementationOnce(() => pending)
    const reporter = await CodexThreadIdentityReporter.start({
      onThreadIdentified: vi.fn(),
      onExecutionDirectoryChanged: changed
    })
    try {
      reporter.acceptTerminalTitle(first)
      const posting = post(reporter, {
        cwd: directory,
        'thread-id': first,
        type: 'agent-turn-complete'
      })
      await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce())
      reporter.acceptTerminalTitle(second)
      release()
      await posting
      changed.mockClear()
      await post(reporter, { cwd: '/repo/old', session_id: first, hook_event_name: 'SessionEnd' })
      expect(changed).not.toHaveBeenCalled()
      await post(reporter, { cwd: directory, 'thread-id': second, type: 'agent-turn-complete' })
      expect(changed).toHaveBeenCalledWith(directory, expect.any(Function))
    } finally {
      release()
      await reporter.close()
    }
  })
})
