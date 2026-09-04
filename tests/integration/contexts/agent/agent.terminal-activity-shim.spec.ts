import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { createAgentActivityRuntime } from '../../../../src/platform/electron-main/agentActivityRuntimeComposition'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe.runIf(process.platform !== 'win32')('ordinary terminal Agent activity integration', () => {
  it('intercepts a standard Agent command without leaking Electron Node mode to the Provider', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-command-'))
    const providerDirectory = join(root, 'provider-bin')
    const capturePath = join(root, 'capture.json')
    await mkdir(providerDirectory)
    await writeFakeProvider(join(providerDirectory, 'codex'))
    const publish = vi.fn()
    const runtime = createAgentActivityRuntime({
      appStateDirectory: root,
      isTerminalScopeActive: () => true,
      logger: createLogger(),
      publish,
      runtimeExecutable: process.execPath
    })

    try {
      await runtime.initialize()
      const prepared = await runtime.launchEnvironmentPreparation.prepare({
        ...runCommand,
        environment: { PATH: `${providerDirectory}${delimiter}${process.env.PATH ?? ''}` }
      })
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        ...prepared.environment,
        CAPTURE_PATH: capturePath
      }
      const shimPath = environment.PATH!.split(delimiter)[0]!

      await execute(join(shimPath, 'codex'), ['--model', 'test-model'], environment)

      const capture = JSON.parse(await readFile(capturePath, 'utf8'))
      expect(capture).toMatchObject({
        args: ['--model', 'test-model', '--config', expect.stringContaining('notify=')],
        electronRunAsNode: null,
        invocationId: expect.any(String)
      })
      expect(capture.args.at(-1)).toContain('hook-relay')
      expect(runtime.list()).toEqual([
        expect.objectContaining({
          invocations: [],
          status: 'unavailable'
        })
      ])
      expect(publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ snapshot: expect.objectContaining({ status: 'idle' }) })
      )
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({ status: 'unavailable' }),
          type: 'activity_changed'
        })
      )
    } finally {
      await runtime.dispose()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('normalizes real hook relay events into global working and completion facts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-relay-'))
    const publish = vi.fn()
    const runtime = createAgentActivityRuntime({
      appStateDirectory: root,
      isTerminalScopeActive: () => true,
      logger: createLogger(),
      publish,
      quietWindowMs: 0,
      runtimeExecutable: process.execPath
    })

    try {
      await runtime.initialize()
      const prepared = await runtime.launchEnvironmentPreparation.prepare(runCommand)
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        ...prepared.environment,
        CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID: 'ordinary-terminal-invocation'
      }
      const manifestDirectory = dirname(environment.CLEANCODE_AGENT_ACTIVITY_MANIFEST!)
      const relayPath = join(manifestDirectory, 'assets-v1', 'hook-relay.mjs')

      await executeRelay(relayPath, environment, {
        hook_event_name: 'UserPromptSubmit',
        session_id: 'provider-session-1'
      })
      expect(runtime.list()[0]?.status).toBe('working')

      await executeRelay(relayPath, environment, {
        hook_event_name: 'PermissionRequest',
        session_id: 'provider-session-1'
      })
      expect(runtime.list()[0]?.status).toBe('waiting_approval')

      await executeRelay(relayPath, environment, {
        hook_event_name: 'PreToolUse',
        session_id: 'provider-session-1'
      })
      expect(runtime.list()[0]?.status).toBe('working')

      await executeRelay(relayPath, environment, {
        hook_event_name: 'Stop',
        session_id: 'provider-session-1'
      })
      await vi.waitFor(() =>
        expect(publish).toHaveBeenCalledWith(
          expect.objectContaining({
            completion: expect.objectContaining({
              identity: expect.objectContaining({
                invocationId: 'ordinary-terminal-invocation',
                providerId: 'claude-code'
              })
            }),
            type: 'turn_completed'
          })
        )
      )
    } finally {
      await runtime.dispose()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('keeps completion-only Codex unavailable while publishing its explicit completion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-codex-completion-'))
    const publish = vi.fn()
    const runtime = createAgentActivityRuntime({
      appStateDirectory: root,
      isTerminalScopeActive: () => true,
      logger: createLogger(),
      publish,
      quietWindowMs: 0,
      runtimeExecutable: process.execPath
    })

    try {
      await runtime.initialize()
      const prepared = await runtime.launchEnvironmentPreparation.prepare(runCommand)
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        ...prepared.environment,
        CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID: 'ordinary-codex-invocation'
      }
      const manifestDirectory = dirname(environment.CLEANCODE_AGENT_ACTIVITY_MANIFEST!)
      const relayPath = join(manifestDirectory, 'assets-v1', 'hook-relay.mjs')

      await reportGatewaySignal(environment, 'codex', {
        status: 'unavailable',
        type: 'status_changed'
      })
      await executeRelay(relayPath, environment, { type: 'agent-turn-complete' }, 'codex')

      expect(runtime.list()[0]?.status).toBe('unavailable')
      await vi.waitFor(() =>
        expect(publish).toHaveBeenCalledWith(
          expect.objectContaining({
            completion: expect.objectContaining({
              identity: expect.objectContaining({ providerId: 'codex' })
            }),
            type: 'turn_completed'
          })
        )
      )
    } finally {
      await runtime.dispose()
      await rm(root, { force: true, recursive: true })
    }
  })

  it.each(['/bin/bash', '/bin/zsh'].filter(existsSync))(
    'keeps the shim first after %s rc rewrites PATH and reports exit after PTY Ctrl+C',
    async (shell) => {
      const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-pty-command-'))
      const providerDirectory = join(root, 'provider-bin')
      const homeDirectory = join(root, 'home')
      const userZdotDirectory = join(root, 'user-zdot')
      const capturePath = join(root, 'capture.json')
      await Promise.all([mkdir(providerDirectory), mkdir(homeDirectory), mkdir(userZdotDirectory)])
      await writeInterruptibleFakeProvider(join(providerDirectory, 'codex'))
      const rcPath = [providerDirectory, dirname(process.execPath), '/usr/bin', '/bin'].join(
        delimiter
      )
      const shellPrompt = 'cleancode-agent-shell-ready> '
      if (shell.endsWith('/bash')) {
        await writeFile(
          join(homeDirectory, '.bashrc'),
          `export PATH="$RC_PROVIDER_PATH"\nexport CLEANCODE_TEST_RC_LOADED=bash\nPS1="${shellPrompt}"\n`
        )
      } else {
        await writeFile(
          join(userZdotDirectory, '.zshenv'),
          'export CLEANCODE_TEST_ZSHENV_LOADED=1\n'
        )
        await writeFile(
          join(userZdotDirectory, '.zshrc'),
          `export PATH="$RC_PROVIDER_PATH"\nexport CLEANCODE_TEST_RC_LOADED=zsh\nPS1="${shellPrompt}"\n`
        )
      }

      const runtime = createAgentActivityRuntime({
        appStateDirectory: root,
        isTerminalScopeActive: () => true,
        logger: createLogger(),
        publish: vi.fn(),
        runtimeExecutable: process.execPath
      })
      const adapter = new NodePtyTerminalProcessAdapter()
      let output = ''

      try {
        await runtime.initialize()
        const prepared = await runtime.launchEnvironmentPreparation.prepare({
          ...runCommand,
          environment: {
            HOME: homeDirectory,
            PATH: rcPath,
            RC_PROVIDER_PATH: rcPath,
            SHELL: shell,
            ...(shell.endsWith('/zsh') ? { ZDOTDIR: userZdotDirectory } : {})
          },
          shell
        })
        const environment: Readonly<Record<string, string>> = {
          ...(prepared.environment ?? {}),
          CAPTURE_PATH: capturePath
        }
        const shimDirectory = environment.PATH!.split(delimiter)[0]!

        await adapter.start({
          columns: 88,
          environment,
          onExit: () => undefined,
          onOutput: (event) => {
            output += event.data
          },
          rows: 24,
          scope: runCommand.scope,
          shell: prepared.shell,
          workingDirectory: root
        })
        await vi.waitFor(() => expect(output).toContain(shellPrompt), { timeout: 5_000 })
        adapter.write(runCommand.scope.sessionId, 'codex --model interrupt-test\r')

        const capture = await waitForJsonFile(capturePath)
        expect(capture).toMatchObject({
          invocationId: expect.any(String),
          rcLoaded: shell.endsWith('/bash') ? 'bash' : 'zsh'
        })
        expect(String(capture.path).split(delimiter)[0]).toBe(shimDirectory)
        if (shell.endsWith('/zsh')) expect(capture.zshEnvLoaded).toBe('1')
        await vi.waitFor(() => expect(runtime.list()[0]?.invocations).toHaveLength(1), {
          timeout: 5_000
        })

        adapter.write(runCommand.scope.sessionId, '\x03')
        await vi.waitFor(() => expect(runtime.list()[0]?.invocations).toHaveLength(0), {
          timeout: 5_000
        })
        adapter.write(runCommand.scope.sessionId, 'printf "after-agent-interrupt\\n"\r')
        await vi.waitFor(() => expect(output).toMatch(/after-agent-interrupt\r?\n/u), {
          timeout: 5_000
        })

        expect(runtime.list()[0]?.status).toBe('unavailable')
      } finally {
        await adapter.disposeAll()
        await runtime.dispose()
        await rm(root, { force: true, recursive: true })
      }
    },
    20_000
  )

  it('forces an Agent that ignores PTY Ctrl+C to exit, reports it, and restores the shell', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-ignored-interrupt-'))
    const providerDirectory = join(root, 'provider-bin')
    const homeDirectory = join(root, 'home')
    const capturePath = join(root, 'capture.json')
    const signalCapturePath = join(root, 'signal.txt')
    const shell = ['/bin/zsh', '/bin/bash', '/bin/sh'].find(existsSync)
    if (!shell) throw new Error('Expected a POSIX shell for the PTY integration test.')
    await Promise.all([mkdir(providerDirectory), mkdir(homeDirectory)])
    await writeSignalIgnoringFakeProvider(join(providerDirectory, 'codex'))
    const providerPath = [providerDirectory, dirname(process.execPath), '/usr/bin', '/bin'].join(
      delimiter
    )
    const runtime = createAgentActivityRuntime({
      appStateDirectory: root,
      isTerminalScopeActive: () => true,
      logger: createLogger(),
      publish: vi.fn(),
      runtimeExecutable: process.execPath
    })
    const adapter = new NodePtyTerminalProcessAdapter()
    let output = ''

    try {
      await runtime.initialize()
      const prepared = await runtime.launchEnvironmentPreparation.prepare({
        ...runCommand,
        environment: { HOME: homeDirectory, PATH: providerPath, SHELL: shell },
        shell
      })
      const environment: Readonly<Record<string, string>> = {
        ...(prepared.environment ?? {}),
        CAPTURE_PATH: capturePath,
        SIGNAL_CAPTURE_PATH: signalCapturePath
      }
      await adapter.start({
        columns: 88,
        environment,
        onExit: () => undefined,
        onOutput: (event) => {
          output += event.data
        },
        rows: 24,
        scope: runCommand.scope,
        shell: prepared.shell,
        workingDirectory: root
      })
      adapter.write(runCommand.scope.sessionId, 'codex --model ignored-interrupt\r')

      const capture = await waitForJsonFile(capturePath)
      const providerProcessId = Number(capture.processId)
      expect(providerProcessId).toBeGreaterThan(1)
      await vi.waitFor(() => expect(runtime.list()[0]?.invocations).toHaveLength(1), {
        timeout: 5_000
      })

      adapter.write(runCommand.scope.sessionId, '\x03')

      await expect(waitForTextFile(signalCapturePath)).resolves.toBe('SIGINT')
      await vi.waitFor(() => expect(isProcessAlive(providerProcessId)).toBe(false), {
        timeout: 5_000
      })
      await vi.waitFor(() => expect(runtime.list()[0]?.invocations).toHaveLength(0), {
        timeout: 5_000
      })
      adapter.write(runCommand.scope.sessionId, 'printf "after-forced-agent-exit\\n"\r')
      await vi.waitFor(() => expect(output).toMatch(/after-forced-agent-exit\r?\n/u), {
        timeout: 5_000
      })
    } finally {
      await adapter.disposeAll()
      await runtime.dispose()
      await rm(root, { force: true, recursive: true })
    }
  }, 20_000)

  it('bounds hook delivery when a stale manifest points at a half-open endpoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-stale-hook-'))
    const sockets = new Set<Socket>()
    const server = createServer(() => undefined)
    server.on('connection', (socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected loopback address.')
    const runtime = createAgentActivityRuntime({
      appStateDirectory: root,
      isTerminalScopeActive: () => true,
      logger: createLogger(),
      publish: vi.fn(),
      runtimeExecutable: process.execPath
    })

    try {
      await runtime.initialize()
      const prepared = await runtime.launchEnvironmentPreparation.prepare(runCommand)
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        ...prepared.environment,
        CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID: 'stale-hook-invocation'
      }
      const manifestDirectory = dirname(environment.CLEANCODE_AGENT_ACTIVITY_MANIFEST!)
      const relayPath = join(manifestDirectory, 'assets-v1', 'hook-relay.mjs')
      const staleManifestPath = join(root, 'stale-gateway.json')
      await writeFile(
        staleManifestPath,
        JSON.stringify({ url: `http://127.0.0.1:${address.port}/agent-activity` })
      )
      environment.CLEANCODE_AGENT_ACTIVITY_MANIFEST = staleManifestPath

      const startedAt = Date.now()
      await executeRelay(relayPath, environment, { hook_event_name: 'UserPromptSubmit' })

      expect(Date.now() - startedAt).toBeLessThan(2_000)
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await runtime.dispose()
      await rm(root, { force: true, recursive: true })
    }
  }, 10_000)
})

const runCommand = {
  environment: undefined,
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

async function writeFakeProvider(path: string): Promise<void> {
  await writeFile(
    path,
    `#!/usr/bin/env node\nconst { writeFileSync } = require('node:fs');\nwriteFileSync(process.env.CAPTURE_PATH, JSON.stringify({ args: process.argv.slice(2), electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null, invocationId: process.env.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID ?? null }));\n`
  )
  await chmod(path, 0o700)
}

async function writeInterruptibleFakeProvider(path: string): Promise<void> {
  await writeFile(
    path,
    `#!${process.execPath}\nconst { writeFileSync } = require('node:fs');\nwriteFileSync(process.env.CAPTURE_PATH, JSON.stringify({ invocationId: process.env.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID ?? null, path: process.env.PATH, rcLoaded: process.env.CLEANCODE_TEST_RC_LOADED ?? null, zshEnvLoaded: process.env.CLEANCODE_TEST_ZSHENV_LOADED ?? null }));\nprocess.stdout.write('fake-provider-ready\\n');\nprocess.on('SIGINT', () => process.exit(130));\nsetInterval(() => {}, 1000);\n`
  )
  await chmod(path, 0o700)
}

async function writeSignalIgnoringFakeProvider(path: string): Promise<void> {
  await writeFile(
    path,
    `#!${process.execPath}\nconst { writeFileSync } = require('node:fs');\nfor (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.on(signal, () => writeFileSync(process.env.SIGNAL_CAPTURE_PATH, signal));\nwriteFileSync(process.env.CAPTURE_PATH, JSON.stringify({ invocationId: process.env.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID ?? null, processId: process.pid }));\nprocess.stdout.write('signal-ignoring-provider-ready\\n');\nsetInterval(() => {}, 1000);\n`
  )
  await chmod(path, 0o700)
}

async function waitForJsonFile(path: string): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | null = null
  await vi.waitFor(
    async () => {
      result = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
      expect(result).not.toBeNull()
    },
    { timeout: 5_000 }
  )
  if (!result) throw new Error('Expected capture file.')
  return result
}

async function waitForTextFile(path: string): Promise<string> {
  let result: string | null = null
  await vi.waitFor(
    async () => {
      result = await readFile(path, 'utf8')
      expect(result).not.toBe('')
    },
    { timeout: 5_000 }
  )
  if (result === null) throw new Error('Expected signal capture file.')
  return result
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    return !(
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { readonly code?: unknown }).code === 'ESRCH'
    )
  }
}

function execute(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(executable, [...args], { env: environment }, (error) =>
      error ? reject(error) : resolve()
    )
  })
}

function executeRelay(
  relayPath: string,
  environment: NodeJS.ProcessEnv,
  payload: unknown,
  providerId = 'claude-code'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [relayPath, providerId],
      { env: environment },
      (error) => (error ? reject(error) : resolve())
    )
    child.stdin?.end(JSON.stringify(payload))
  })
}

async function reportGatewaySignal(
  environment: NodeJS.ProcessEnv,
  providerId: string,
  signal: Readonly<Record<string, string>>
): Promise<void> {
  const terminal = JSON.parse(
    Buffer.from(environment.CLEANCODE_AGENT_ACTIVITY_SCOPE ?? '', 'base64url').toString('utf8')
  )
  const manifest = JSON.parse(
    await readFile(environment.CLEANCODE_AGENT_ACTIVITY_MANIFEST!, 'utf8')
  )
  const response = await fetch(manifest.url, {
    body: JSON.stringify({
      identity: {
        invocationId: environment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID,
        providerId,
        terminal
      },
      signal
    }),
    headers: {
      authorization: `Bearer ${environment.CLEANCODE_AGENT_ACTIVITY_TOKEN}`,
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  expect(response.status).toBe(204)
}

function createLogger(): Logger {
  return { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}
