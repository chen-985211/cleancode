import { randomUUID } from 'node:crypto'
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  createClaudeSettings,
  createGeminiSettings,
  createPosixHookRelayLauncher,
  createPosixShim,
  createTerminalAgentLaunchSpecs,
  terminalAgentBashRcScript,
  terminalAgentHookRelayScript,
  terminalAgentOpenCodePluginScript,
  terminalAgentPosixShellLauncherScript,
  terminalAgentShimLauncherScript,
  terminalAgentZshEnvScript,
  terminalAgentZshLoginScript,
  terminalAgentZshProfileScript,
  terminalAgentZshRcScript
} from './TerminalAgentTelemetryScripts'
import {
  createWindowsCmdShim,
  createWindowsHookRelayLauncher,
  createWindowsPowerShellShim
} from './TerminalAgentTelemetryWindowsScripts'

export interface TerminalAgentTelemetryAssets {
  readonly gatewayManifestPath: string
  readonly bashRcPath: string
  readonly hookRelayPath: string
  readonly launchSpecsPath: string
  readonly rootDirectory: string
  readonly shimDirectory: string
  readonly shellLauncherPath: string
  readonly zshDotDirectory: string
}

interface TerminalAgentTelemetryAssetStoreOptions {
  readonly platform?: NodeJS.Platform
  readonly runtimeExecutable: string
  readonly stateDirectory: string
}

const providerShims = [
  { commandName: 'claude', providerId: 'claude-code' },
  { commandName: 'codex', providerId: 'codex' },
  { commandName: 'gemini', providerId: 'gemini' },
  { commandName: 'opencode', providerId: 'opencode' }
] as const

export class TerminalAgentTelemetryAssetStore {
  private readonly platform: NodeJS.Platform
  private readonly runtimeExecutable: string
  private readonly rootDirectory: string
  private ensurePromise: Promise<TerminalAgentTelemetryAssets> | null = null

  constructor(options: TerminalAgentTelemetryAssetStoreOptions) {
    this.platform = options.platform ?? process.platform
    this.runtimeExecutable = options.runtimeExecutable
    this.rootDirectory = join(options.stateDirectory, 'agent-activity')
  }

  ensure(): Promise<TerminalAgentTelemetryAssets> {
    if (this.ensurePromise) return this.ensurePromise

    const attempt = this.materialize().catch((error: unknown) => {
      if (this.ensurePromise === attempt) this.ensurePromise = null
      throw error
    })
    this.ensurePromise = attempt
    return attempt
  }

  async publishGateway(url: string): Promise<void> {
    const assets = await this.ensure()
    await writePrivateFileAtomically(assets.gatewayManifestPath, JSON.stringify({ url }))
  }

  private async materialize(): Promise<TerminalAgentTelemetryAssets> {
    const assetDirectory = join(this.rootDirectory, 'assets-v1')
    const shimDirectory = join(assetDirectory, 'bin')
    const gatewayManifestPath = join(this.rootDirectory, 'gateway.json')
    const hookRelayPath = join(assetDirectory, 'hook-relay.mjs')
    const bashRcPath = join(assetDirectory, 'shell', 'bashrc')
    const hookRelayLauncherPath = join(
      assetDirectory,
      this.platform === 'win32' ? 'hook-relay.cmd' : 'hook-relay'
    )
    const openCodePluginPath = join(assetDirectory, 'opencode-plugin.mjs')
    const shimLauncherPath = join(assetDirectory, 'shim-launcher.mjs')
    const launchSpecsPath = join(assetDirectory, 'launch-specs.json')
    const shellDirectory = join(assetDirectory, 'shell')
    const shellLauncherPath = join(shellDirectory, 'launch')
    const zshDotDirectory = join(shellDirectory, 'zsh')
    await Promise.all([
      mkdir(shimDirectory, { mode: 0o700, recursive: true }),
      mkdir(zshDotDirectory, { mode: 0o700, recursive: true })
    ])

    await Promise.all([
      writeExecutableFile(
        hookRelayLauncherPath,
        this.platform === 'win32'
          ? createWindowsHookRelayLauncher(this.runtimeExecutable, hookRelayPath)
          : createPosixHookRelayLauncher(this.runtimeExecutable, hookRelayPath)
      ),
      writePrivateFileAtomically(hookRelayPath, terminalAgentHookRelayScript),
      writePrivateFileAtomically(openCodePluginPath, terminalAgentOpenCodePluginScript),
      writePrivateFileAtomically(shimLauncherPath, terminalAgentShimLauncherScript),
      ...(this.platform === 'win32'
        ? []
        : [
            writeExecutableFile(shellLauncherPath, terminalAgentPosixShellLauncherScript),
            writePrivateFileAtomically(bashRcPath, terminalAgentBashRcScript),
            writePrivateFileAtomically(join(zshDotDirectory, '.zshenv'), terminalAgentZshEnvScript),
            writePrivateFileAtomically(
              join(zshDotDirectory, '.zprofile'),
              terminalAgentZshProfileScript
            ),
            writePrivateFileAtomically(join(zshDotDirectory, '.zshrc'), terminalAgentZshRcScript),
            writePrivateFileAtomically(
              join(zshDotDirectory, '.zlogin'),
              terminalAgentZshLoginScript
            )
          ])
    ])

    const scriptPaths = {
      assetDirectory,
      hookRelayLauncherPath,
      hookRelayPath,
      openCodePluginPath,
      runtimeExecutable: this.runtimeExecutable
    }
    await Promise.all([
      writePrivateFileAtomically(
        join(assetDirectory, 'claude-settings.json'),
        JSON.stringify(createClaudeSettings(hookRelayLauncherPath))
      ),
      writePrivateFileAtomically(
        join(assetDirectory, 'gemini-settings.json'),
        JSON.stringify(createGeminiSettings(hookRelayLauncherPath))
      ),
      writePrivateFileAtomically(
        launchSpecsPath,
        JSON.stringify(createTerminalAgentLaunchSpecs(scriptPaths))
      ),
      ...providerShims.flatMap(({ commandName, providerId }) =>
        this.createProviderShimWrites({ commandName, providerId, shimDirectory, shimLauncherPath })
      )
    ])

    return {
      bashRcPath,
      gatewayManifestPath,
      hookRelayPath,
      launchSpecsPath,
      rootDirectory: this.rootDirectory,
      shimDirectory,
      shellLauncherPath,
      zshDotDirectory
    }
  }

  private createProviderShimWrites(input: {
    readonly commandName: string
    readonly providerId: string
    readonly shimDirectory: string
    readonly shimLauncherPath: string
  }): readonly Promise<void>[] {
    const command = { ...input, runtimeExecutable: this.runtimeExecutable }
    if (this.platform !== 'win32') {
      return [
        writeExecutableFile(join(input.shimDirectory, input.commandName), createPosixShim(command))
      ]
    }
    return [
      writeExecutableFile(
        join(input.shimDirectory, `${input.commandName}.cmd`),
        createWindowsCmdShim(command)
      ),
      writePrivateFileAtomically(
        join(input.shimDirectory, `${input.commandName}.ps1`),
        createWindowsPowerShellShim(command)
      )
    ]
  }
}

function writeExecutableFile(path: string, content: string): Promise<void> {
  return writeFileAtomically(path, content, 0o700)
}

function writePrivateFileAtomically(path: string, content: string): Promise<void> {
  return writeFileAtomically(path, content, 0o600)
}

async function writeFileAtomically(path: string, content: string, mode: number): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, content, { mode })
  try {
    await rename(temporaryPath, path)
    if (process.platform !== 'win32') await chmod(path, mode)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}
