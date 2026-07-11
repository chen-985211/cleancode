import { accessSync, chmodSync, constants, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { platform } from 'node:os'
import { dirname, join } from 'node:path'

import type { IPty } from 'node-pty'
import { spawn as spawnPtyProcess } from 'node-pty'

import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  CodexAgentProcessHandle,
  CodexAgentProcessPort,
  StartCodexAgentProcessCommand
} from '../../application/ports/CodexAgentProcessPort'
import { codexAgentDeveloperInstructions } from '../../application/dto/AgentToolProtocol'
import { CodexThreadIdentityReporter } from './CodexThreadIdentityReporter'

const nodeRequire = createRequire(import.meta.url)
const localMcpNoProxyHosts = ['127.0.0.1', 'localhost', '::1']

export interface NodePtyCodexAgentProcessAdapterOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
}

export class NodePtyCodexAgentProcessAdapter implements CodexAgentProcessPort {
  private readonly baseArgs: readonly string[]
  private readonly command: string
  private readonly processes = new Map<string, ManagedCodexAgentProcess>()

  constructor(options: NodePtyCodexAgentProcessAdapterOptions = {}) {
    this.baseArgs = options.baseArgs ?? []
    this.command = options.command ?? 'codex'
  }

  async start(command: StartCodexAgentProcessCommand): Promise<CodexAgentProcessHandle> {
    ensureNodePtySpawnHelperIsExecutable()
    const identityReporter = await CodexThreadIdentityReporter.start({
      onThreadIdentified: command.onCodexThreadIdentified,
      workspaceDirectory: command.workspaceDirectory
    })
    let ptyProcess: IPty

    try {
      ptyProcess = spawnPtyProcess(this.command, [...this.createArgs(command)], {
        cols: command.columns,
        cwd: command.workspaceDirectory,
        env: createProcessEnvironment(command.bearerToken, identityReporter),
        name: 'xterm-256color',
        rows: command.rows
      })
    } catch (error) {
      await identityReporter.close()
      throw error
    }

    let resolveExit = (): void => undefined
    const exit = new Promise<void>((resolve) => {
      resolveExit = resolve
    })
    this.processes.set(command.sessionId, { exit, identityReporter, process: ptyProcess })
    ptyProcess.onData((data) => command.onOutput({ data, sessionId: command.sessionId }))
    ptyProcess.onExit((event) => {
      this.processes.delete(command.sessionId)
      void identityReporter.close()
      resolveExit()
      command.onExit({ exitCode: event.exitCode, sessionId: command.sessionId })
    })

    return { processId: ptyProcess.pid }
  }

  write(sessionId: string, input: string): void {
    this.requireProcess(sessionId).process.write(input)
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.requireProcess(sessionId).process.resize(columns, rows)
  }

  async stop(sessionId: string): Promise<void> {
    const managedProcess = this.processes.get(sessionId)

    if (!managedProcess) {
      return Promise.resolve()
    }

    managedProcess.process.kill()
    const didExit = await waitForProcessExit(managedProcess.exit)

    if (!didExit) {
      this.processes.delete(sessionId)
      await managedProcess.identityReporter.close()
    }
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.processes.keys()].map((sessionId) => this.stop(sessionId)))
  }

  private createArgs(command: StartCodexAgentProcessCommand): readonly string[] {
    const sharedArgs = [
      ...this.baseArgs,
      ...(command.resumeThreadId ? ['resume', command.resumeThreadId] : []),
      '--no-alt-screen',
      '-C',
      command.workspaceDirectory,
      '--sandbox',
      'workspace-write',
      '--ask-for-approval',
      'on-request',
      '--config',
      `developer_instructions=${toTomlString(codexAgentDeveloperInstructions)}`,
      '--config',
      `mcp_servers.cleancode.url="${command.mcpServerUrl}"`,
      '--config',
      'mcp_servers.cleancode.bearer_token_env_var="CLEANCODE_MCP_TOKEN"',
      '--config',
      'mcp_servers.cleancode.enabled=true',
      '--config',
      `notify=${JSON.stringify([process.execPath, '-e', codexNotifyReporterScript])}`,
      '--config',
      'mcp_servers.cleancode.default_tools_approval_mode="approve"'
    ]

    return sharedArgs
  }

  private requireProcess(sessionId: string): ManagedCodexAgentProcess {
    const managedProcess = this.processes.get(sessionId)

    if (!managedProcess) {
      throw createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Agent session was not found.')
    }

    return managedProcess
  }
}

function toTomlString(value: string): string {
  return JSON.stringify(value)
}

interface ManagedCodexAgentProcess {
  readonly exit: Promise<void>
  readonly identityReporter: CodexThreadIdentityReporter
  readonly process: IPty
}

function createProcessEnvironment(
  bearerToken: string,
  identityReporter: CodexThreadIdentityReporter
): Record<string, string> {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string'
    })
  )
  const noProxy = mergeNoProxyHosts(
    inheritedEnvironment.NO_PROXY,
    inheritedEnvironment.no_proxy,
    localMcpNoProxyHosts
  )

  return {
    ...inheritedEnvironment,
    CLEANCODE_CODEX_NOTIFY_TOKEN: identityReporter.token,
    CLEANCODE_CODEX_NOTIFY_URL: identityReporter.url,
    CLEANCODE_MCP_TOKEN: bearerToken,
    ELECTRON_RUN_AS_NODE: '1',
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    PROMPT_EOL_MARK: ''
  }
}

const codexNotifyReporterScript = [
  'const body=process.argv.at(-1);',
  'fetch(process.env.CLEANCODE_CODEX_NOTIFY_URL,{',
  'method:"POST",',
  'headers:{authorization:`Bearer ${process.env.CLEANCODE_CODEX_NOTIFY_TOKEN}`},',
  'body',
  '}).catch(()=>{});'
].join('')

async function waitForProcessExit(exit: Promise<void>): Promise<boolean> {
  return Promise.race([
    exit.then(() => true),
    new Promise<false>((resolveTimeout) => setTimeout(() => resolveTimeout(false), 3_000))
  ])
}

function mergeNoProxyHosts(
  uppercaseNoProxy: string | undefined,
  lowercaseNoProxy: string | undefined,
  requiredHosts: readonly string[]
): string {
  const hosts: string[] = []
  const normalizedHosts = new Set<string>()

  for (const value of [uppercaseNoProxy, lowercaseNoProxy]) {
    for (const host of splitNoProxyHosts(value)) {
      addNoProxyHost(hosts, normalizedHosts, host)
    }
  }

  for (const host of requiredHosts) {
    addNoProxyHost(hosts, normalizedHosts, host)
  }

  return hosts.join(',')
}

function splitNoProxyHosts(value: string | undefined): readonly string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
}

function addNoProxyHost(hosts: string[], normalizedHosts: Set<string>, host: string): void {
  const normalizedHost = host.toLowerCase()

  if (normalizedHosts.has(normalizedHost)) {
    return
  }

  normalizedHosts.add(normalizedHost)
  hosts.push(host)
}

function ensureNodePtySpawnHelperIsExecutable(): void {
  const helperPath = resolveNodePtySpawnHelperPath()

  if (!helperPath || !existsSync(helperPath)) {
    return
  }

  try {
    accessSync(helperPath, constants.X_OK)
    return
  } catch {
    // pnpm can preserve node-pty's macOS helper without the executable bit.
  }

  try {
    chmodSync(helperPath, 0o755)
    accessSync(helperPath, constants.X_OK)
  } catch (error) {
    throw new Error(
      `Unable to prepare node-pty spawn helper at ${helperPath}: ${getErrorMessage(error)}`
    )
  }
}

function resolveNodePtySpawnHelperPath(): string | null {
  try {
    const nodePtyEntryPath = nodeRequire.resolve('node-pty')
    const nodePtyPackageDirectory = dirname(dirname(nodePtyEntryPath))

    return join(
      nodePtyPackageDirectory,
      'prebuilds',
      `${process.platform}-${process.arch}`,
      platform() === 'win32' ? 'winpty-agent.exe' : 'spawn-helper'
    )
      .replace('app.asar', 'app.asar.unpacked')
      .replace('node_modules.asar', 'node_modules.asar.unpacked')
  } catch {
    return null
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
