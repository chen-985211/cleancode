import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  createAgentActivityRuntime,
  waitForOptionalAgentActivityInitialization
} from '../../../src/platform/electron-main/agentActivityRuntimeComposition'
import type { Logger } from '../../../src/platform/logging/Logger'

describe('Agent activity runtime composition', () => {
  it('bounds optional initialization without canceling a later successful result', async () => {
    vi.useFakeTimers()
    try {
      let resolveInitialization!: (value: string) => void
      const initialization = new Promise<string>((resolve) => {
        resolveInitialization = resolve
      })
      const firstWait = waitForOptionalAgentActivityInitialization(initialization, 25)

      await vi.advanceTimersByTimeAsync(25)
      await expect(firstWait).resolves.toEqual({ status: 'timed_out' })

      resolveInitialization('ready')
      await expect(waitForOptionalAgentActivityInitialization(initialization, 25)).resolves.toEqual(
        {
          status: 'ready',
          value: 'ready'
        }
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries initialization after a transient filesystem failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-activity-retry-'))
    const stateDirectory = join(root, 'state')
    await writeFile(stateDirectory, 'temporarily blocked')
    const runtime = createAgentActivityRuntime({
      appStateDirectory: stateDirectory,
      isTerminalScopeActive: () => true,
      logger: createLogger(),
      publish: vi.fn(),
      runtimeExecutable: process.execPath
    })

    try {
      await expect(runtime.initialize()).rejects.toBeInstanceOf(Error)
      await rm(stateDirectory)
      await mkdir(stateDirectory)

      await expect(runtime.initialize()).resolves.toBeUndefined()
    } finally {
      await runtime.dispose()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('connects an opted-in terminal environment through the authenticated gateway to Registry events', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-activity-runtime-'))
    const publish = vi.fn()
    const runtime = createAgentActivityRuntime({
      appStateDirectory: stateDirectory,
      isTerminalScopeActive: () => true,
      logger: createLogger(),
      publish,
      runtimeExecutable: process.execPath
    })

    try {
      await runtime.initialize()
      const prepared = await runtime.launchEnvironmentPreparation.prepare(runCommand)
      const environment = prepared.environment ?? {}
      const terminal = JSON.parse(
        Buffer.from(environment.CLEANCODE_AGENT_ACTIVITY_SCOPE ?? '', 'base64url').toString('utf8')
      )
      const manifest = JSON.parse(
        await readFile(environment.CLEANCODE_AGENT_ACTIVITY_MANIFEST!, 'utf8')
      )
      const response = await fetch(manifest.url, {
        body: JSON.stringify({
          identity: { invocationId: 'invocation-1', providerId: 'codex', terminal },
          signal: { status: 'working', type: 'status_changed' }
        }),
        headers: {
          authorization: `Bearer ${environment.CLEANCODE_AGENT_ACTIVITY_TOKEN}`,
          'content-type': 'application/json'
        },
        method: 'POST'
      })

      expect(response.status).toBe(204)
      await vi.waitFor(() =>
        expect(publish).toHaveBeenCalledWith({
          snapshot: expect.objectContaining({ status: 'working', terminal }),
          type: 'activity_changed'
        })
      )
      expect(runtime.list()).toEqual([expect.objectContaining({ status: 'working', terminal })])
      expect(runtime.registry.list()).toEqual(runtime.list())
    } finally {
      await runtime.dispose()
      await rm(stateDirectory, { force: true, recursive: true })
    }
  })
})

const runCommand = {
  environment: { EXISTING: 'value' },
  launchCommand: undefined,
  launchMode: undefined,
  scope: {
    blockId: 'terminal-block-1',
    generation: 1,
    gitBranch: 'main',
    owner: { id: 'terminal-block-1', kind: 'block' as const },
    projectDirectory: '/project',
    projectId: 'project-1',
    runId: 'terminal-run-1',
    sessionId: 'terminal-session-1',
    workspaceDirectory: '/workspace',
    workspaceId: 'workspace-1'
  },
  sessionKind: 'interactive' as const,
  terminalSourceTheme: 'dark' as const,
  workingDirectory: '/workspace'
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}
