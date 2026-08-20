import { randomBytes } from 'node:crypto'
import { posix, win32, type PlatformPath } from 'node:path'

import type { AgentActivityTerminalScope } from '../../application/dto/AgentActivityProtocol'
import type { AgentHookIdentitySigner } from './AgentHookIdentitySigner'
import type { TerminalAgentTelemetryAssets } from './TerminalAgentTelemetryAssetStore'

interface TerminalAgentTelemetryAssetPort {
  ensure(): Promise<TerminalAgentTelemetryAssets>
  publishGateway(url: string): Promise<void>
}

interface TerminalAgentActivityEnvironmentServiceOptions {
  readonly assets: TerminalAgentTelemetryAssetPort
  readonly inheritedPath?: string
  readonly inheritedShell?: string
  readonly platform: NodeJS.Platform
  readonly signer: AgentHookIdentitySigner
}

export interface PrepareTerminalAgentActivityEnvironmentCommand {
  readonly environment: Readonly<Record<string, string>> | undefined
  readonly launchCommand: string | undefined
  readonly shell?: string
  readonly terminalSourceTheme: 'dark' | 'light'
  readonly terminal: AgentActivityTerminalScope
}

export interface TerminalAgentPrivateOutputControl {
  readonly environment: Readonly<{
    CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: string
    CLEANCODE_TERMINAL_SOURCE_THEME: 'dark' | 'light'
  }>
  readonly protocol: 'osc-633-span-v1'
  readonly token: string
}

export class TerminalAgentActivityEnvironmentService {
  private readonly inheritedPath: string
  private readonly inheritedShell: string
  private readonly path: PlatformPath
  private readonly platform: NodeJS.Platform

  constructor(private readonly options: TerminalAgentActivityEnvironmentServiceOptions) {
    this.platform = options.platform
    this.path = this.platform === 'win32' ? win32 : posix
    this.inheritedPath =
      options.inheritedPath ?? readEnvironmentPath(process.env, this.platform) ?? ''
    this.inheritedShell = options.inheritedShell ?? process.env.SHELL ?? '/bin/sh'
  }

  initialize(gatewayUrl: string): Promise<void> {
    return this.options.assets.publishGateway(gatewayUrl)
  }

  async prepare(command: PrepareTerminalAgentActivityEnvironmentCommand): Promise<{
    readonly environment: Readonly<Record<string, string>>
    readonly launchCommand: string | undefined
    readonly privateOutputControl?: TerminalAgentPrivateOutputControl
    readonly shell: string | undefined
  }> {
    const assets = await this.options.assets.ensure()
    const identity = {
      invocationId: 'terminal-scope',
      providerId: 'terminal-scope',
      terminal: command.terminal
    }
    const currentPath =
      readEnvironmentPath(command.environment, this.platform) ?? this.inheritedPath
    const environment = normalizeEnvironmentPath(command.environment, this.platform)
    const realShell = command.shell ?? this.inheritedShell
    const shouldUsePrivateShellLauncher =
      this.platform !== 'win32' &&
      command.launchCommand === undefined &&
      isSupportedPosixInteractiveShell(realShell, this.path)
    const privateOutputControl =
      this.platform === 'win32'
        ? createPrivateOutputControl(command.terminalSourceTheme)
        : undefined
    return {
      environment: {
        ...environment,
        ...(shouldUsePrivateShellLauncher
          ? {
              CLEANCODE_AGENT_ACTIVITY_BASH_RC: assets.bashRcPath,
              CLEANCODE_AGENT_ACTIVITY_ORIGINAL_ZDOTDIR: environment.ZDOTDIR ?? '',
              CLEANCODE_AGENT_ACTIVITY_REAL_SHELL: realShell,
              CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY: assets.shimDirectory,
              CLEANCODE_AGENT_ACTIVITY_ZSH_DOT_DIRECTORY: assets.zshDotDirectory
            }
          : {}),
        CLEANCODE_AGENT_ACTIVITY_MANIFEST: assets.gatewayManifestPath,
        CLEANCODE_AGENT_ACTIVITY_SCOPE: Buffer.from(
          JSON.stringify(command.terminal),
          'utf8'
        ).toString('base64url'),
        CLEANCODE_AGENT_ACTIVITY_TOKEN: this.options.signer.sign(identity),
        PATH: prependUniquePath(currentPath, assets.shimDirectory, this.path)
      },
      launchCommand: command.launchCommand,
      privateOutputControl,
      shell: shouldUsePrivateShellLauncher ? assets.shellLauncherPath : command.shell
    }
  }
}

function createPrivateOutputControl(
  terminalSourceTheme: 'dark' | 'light'
): TerminalAgentPrivateOutputControl {
  const token = randomBytes(24).toString('hex')
  return {
    environment: {
      CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: token,
      CLEANCODE_TERMINAL_SOURCE_THEME: terminalSourceTheme
    },
    protocol: 'osc-633-span-v1',
    token
  }
}

function isSupportedPosixInteractiveShell(shell: string, path: PlatformPath): boolean {
  const shellName = path.basename(shell).toLowerCase()
  return shellName === 'bash' || shellName === 'zsh'
}

function prependUniquePath(currentPath: string, directory: string, path: PlatformPath): string {
  const normalizedDirectory = path.resolve(directory)
  const entries = currentPath
    .split(path.delimiter)
    .filter(Boolean)
    .filter((entry) => path.resolve(entry) !== normalizedDirectory)
  return [directory, ...entries].join(path.delimiter)
}

function readEnvironmentPath(
  environment: Readonly<Record<string, string | undefined>> | undefined,
  platform: NodeJS.Platform
): string | undefined {
  if (!environment) return undefined
  if (platform !== 'win32') return environment.PATH
  const key = Object.keys(environment).find((candidate) => candidate.toLowerCase() === 'path')
  return key ? environment[key] : undefined
}

function normalizeEnvironmentPath(
  environment: Readonly<Record<string, string>> | undefined,
  platform: NodeJS.Platform
): Record<string, string> {
  const normalized = { ...environment }
  if (platform === 'win32') {
    for (const key of Object.keys(normalized)) {
      if (key.toLowerCase() === 'path') delete normalized[key]
    }
  }
  return normalized
}
