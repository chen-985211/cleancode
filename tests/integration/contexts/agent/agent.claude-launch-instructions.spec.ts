import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { cleancodeMcpDeveloperInstructions } from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'
import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'

describe('Claude Code launch instructions', () => {
  let workspace: string
  let artifacts: AgentLaunchArtifactScope

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'cleancode-claude-instructions-'))
    artifacts = new AgentLaunchArtifactScope()
  })

  afterEach(async () => {
    try {
      await artifacts.dispose()
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it.each(['fresh', 'resume', 'peer-task'] as const)(
    'loads complete instructions from a private launch file for %s without oversized argv',
    async (mode) => {
      const plan = await createPlan([], true, mode)
      // The npm .cmd entry must stay below cmd.exe's 8191-character command-line limit.
      expect(plan.args.join(' ').length).toBeLessThan(8191)
      expect(plan.args).not.toContain('--append-system-prompt')
      const path = plan.args[plan.args.indexOf('--append-system-prompt-file') + 1]!
      expect(await readFile(path, 'utf8')).toBe(cleancodeMcpDeveloperInstructions)
      if (process.platform !== 'win32') {
        expect((await stat(path)).mode & 0o777).toBe(0o600)
        expect((await stat(dirname(path))).mode & 0o777).toBe(0o700)
      }
      if (mode === 'resume') expect(plan.args).toContain('--resume')
      if (mode === 'peer-task') expect(plan.args.slice(-2)).toEqual(['--', 'Read your inbox.'])
      await artifacts.dispose()
      await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it.each(['inline', 'inline-equals', 'file', 'file-equals'] as const)(
    'preserves user %s instructions without conflicting append flags or rewriting the user file',
    async (source) => {
      const userInstructions = '用户约束：保留 "引号"、$变量 与换行。\n'.repeat(400)
      const filename = 'user rules.txt'
      await writeFile(join(workspace, filename), userInstructions, 'utf8')
      const flag = source.startsWith('file')
        ? '--append-system-prompt-file'
        : '--append-system-prompt'
      const value = source.startsWith('file') ? filename : userInstructions
      const args = source.endsWith('equals') ? [`${flag}=${value}`] : [flag, value]
      const plan = await createPlan([...args, '--permission-mode', 'plan'])
      expect(plan.args.join(' ').length).toBeLessThan(8191)
      expect(plan.args.filter((arg) => arg === '--append-system-prompt-file')).toHaveLength(1)
      expect(plan.args).not.toContain('--append-system-prompt')
      expect(plan.args).toEqual(expect.arrayContaining(['--permission-mode', 'plan']))
      const path = plan.args[plan.args.indexOf('--append-system-prompt-file') + 1]!
      expect(await readFile(path, 'utf8')).toBe(
        `${userInstructions}\n${cleancodeMcpDeveloperInstructions}`
      )
      await artifacts.dispose()
      expect(await readFile(join(workspace, filename), 'utf8')).toBe(userInstructions)
    }
  )

  it('leaves user prompt arguments untouched when CleanCode MCP is disabled', async () => {
    const args = ['--append-system-prompt', 'User instructions.']
    const plan = await createPlan(args, false)
    expect(plan.args.slice(0, 2)).toEqual(args)
    expect(plan.args).not.toContain('--append-system-prompt-file')
    expect(plan.env).not.toHaveProperty('CLEANCODE_MCP_TOKEN')
  })

  it('rejects conflicting user append sources instead of silently dropping either one', async () => {
    await expect(
      createPlan(['--append-system-prompt', 'Inline', '--append-system-prompt-file', 'rules.txt'])
    ).rejects.toThrow('Cannot use both')
    await artifacts.dispose()
    expect(artifacts.isDisposed).toBe(true)
  })

  it('fails and releases launch resources when a user instruction file cannot be read', async () => {
    await expect(createPlan(['--append-system-prompt-file', 'missing.txt'])).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await artifacts.dispose()
    expect(artifacts.isDisposed).toBe(true)
  })

  function createPlan(args: readonly string[], enabled = true, mode = 'fresh') {
    const contribution = new ClaudeCodeAgentProviderContribution({ baseArgs: args })
    return contribution.launcher.createLaunchPlan({
      artifacts,
      ...(enabled
        ? { cleancodeMcp: { bearerToken: 'test-token', serverUrl: 'http://127.0.0.1:43121/mcp' } }
        : {}),
      ...(mode === 'resume'
        ? {
            providerSessionRef: {
              formatVersion: 1,
              kind: 'claude-session',
              value: '550e8400-e29b-41d4-a716-446655440000'
            }
          }
        : {}),
      ...(mode === 'peer-task' ? { initialPrompt: 'Read your inbox.' } : {}),
      onProviderSessionIdentified: () => undefined,
      workspaceDirectory: workspace
    })
  }
})
