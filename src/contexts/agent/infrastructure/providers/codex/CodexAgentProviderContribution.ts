import { createExpectedAppError } from '../../../../../shared-kernel/application/errors/AppError'
import type {
  AgentCapabilityInjector,
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDetector,
  AgentProviderSessionRefCodec,
  AgentResumeStrategy,
  AgentRuntimeArtifact,
  AgentTelemetryContribution,
  CreateAgentLaunchPlanCommand
} from '../../../application/ports/AgentProviderContribution'
import { cleancodeMcpDeveloperInstructions } from '../../../application/dto/AgentToolProtocol'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../../../domain/value-objects/ProviderSessionRef'
import { CodexThreadIdentityReporter } from '../../pty/CodexThreadIdentityReporter'
import { resolveAgentProviderInstallCommand } from '../shared/AgentProviderInstallation'
import { createAgentProviderLoopbackEnvironment } from '../shared/AgentProviderLoopbackEnvironment'
import { codexProviderIcon } from '../shared/AgentProviderBrandIcons'
import { NodeAgentProviderCliDetector } from '../shared/NodeAgentProviderCliDetector'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import {
  resolveCodexSessionEndHookTrust,
  type CodexSessionEndHookTrustResolver
} from './CodexSessionEndHookTrustResolver'
import {
  resolveCodexThreadIdPrefix,
  type CodexThreadPrefixResolver
} from './CodexThreadPrefixResolver'
import { serializeCodexTomlString, serializeCodexTomlStringArray } from './CodexTomlConfiguration'

export const codexInstallCommands = {
  linux: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  macos: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  windows:
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://chatgpt.com/codex/install.ps1 | iex"'
} as const
interface CodexTelemetryRuntime extends AgentRuntimeArtifact {
  readonly env: Readonly<Record<string, string>>
  readonly notifyCommand: readonly string[]
  readonly onTerminalTitleChanged?: (title: string) => void
  readonly sessionEndHook?: {
    readonly command: string
    readonly configuration: string
  }
}

type CodexTelemetryFactory = (command: {
  readonly appServerArgs: readonly string[]
  readonly environment: Readonly<Record<string, string>>
  readonly executable: string
  readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
  readonly onTurnCompleted?: () => void
  readonly workspaceDirectory: string
}) => Promise<CodexTelemetryRuntime>

export interface CodexAgentProviderContributionOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
  readonly detector?: AgentProviderDetector
  readonly hookTrustResolver?: CodexSessionEndHookTrustResolver
  readonly runtimeExecutable?: string
  readonly runtimePlatform?: NodeJS.Platform
  readonly telemetryFactory?: CodexTelemetryFactory
  readonly threadPrefixResolver?: CodexThreadPrefixResolver
}

export class CodexAgentProviderContribution implements AgentProviderContribution {
  readonly descriptor = {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: true,
      launchInstructions: true,
      resume: true,
      sessionIdentityCapture: true,
      sessionRefCodec: true
    },
    displayName: 'Codex',
    documentationUrl: 'https://developers.openai.com/codex/cli/',
    icon: codexProviderIcon,
    id: 'codex',
    launch: {
      defaultArguments: [],
      defaultEnvironment: {},
      executable: 'codex',
      permission: { arguments: ['--dangerously-bypass-approvals-and-sandbox'] }
    }
  } as const
  readonly detector: AgentProviderDetector
  readonly sessionRefCodec: AgentProviderSessionRefCodec = new CodexSessionRefCodec()
  readonly resume: AgentResumeStrategy = new CodexResumeStrategy(this.sessionRefCodec)
  readonly telemetry: CodexTelemetryContribution
  readonly cleancodeCapability: AgentCapabilityInjector
  readonly launcher: AgentLaunchPlanner

  constructor(options: CodexAgentProviderContributionOptions = {}) {
    const command = options.command ?? 'codex'
    const baseArgs = options.baseArgs ?? []
    const runtimeExecutable = options.runtimeExecutable ?? process.execPath
    const runtimePlatform = options.runtimePlatform ?? process.platform
    this.detector =
      options.detector ??
      new NodeAgentProviderCliDetector({
        executable: command,
        installCommand: resolveAgentProviderInstallCommand(codexInstallCommands),
        providerId: this.descriptor.id
      })
    this.telemetry = new CodexTelemetryContribution(
      options.telemetryFactory ??
        ((telemetryCommand) =>
          createCodexTelemetryRuntime(
            telemetryCommand,
            runtimeExecutable,
            options.threadPrefixResolver ?? resolveCodexThreadIdPrefix,
            runtimePlatform
          )),
      command,
      options.hookTrustResolver ?? resolveCodexSessionEndHookTrust,
      baseArgs,
      runtimePlatform
    )
    this.cleancodeCapability = new CodexCleancodeCapabilityInjector(runtimePlatform)
    this.launcher = new CodexLaunchPlanner({
      baseArgs,
      cleancodeCapability: this.cleancodeCapability,
      command,
      resume: this.resume,
      telemetry: this.telemetry
    })
  }
}

class CodexResumeStrategy implements AgentResumeStrategy {
  constructor(private readonly sessionRefCodec: AgentProviderSessionRefCodec) {}

  createResumeArgs(sessionRef: ProviderSessionRefSnapshot): readonly string[] {
    const parsed = this.sessionRefCodec.parse(sessionRef)
    return ['resume', parsed.value]
  }
}

class CodexSessionRefCodec implements AgentProviderSessionRefCodec {
  parse(sessionRef: ProviderSessionRefSnapshot): ProviderSessionRefSnapshot {
    const parsed = ProviderSessionRef.create(sessionRef).toSnapshot()
    if (
      parsed.formatVersion !== 1 ||
      parsed.kind !== 'codex-thread' ||
      !isCodexThreadUuid(parsed.value)
    ) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'Unsupported Codex Provider session reference.',
        { providerId: 'codex' }
      )
    }
    return parsed
  }
}

function isCodexThreadUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

class CodexTelemetryContribution implements AgentTelemetryContribution {
  readonly signals = { activity: false, sessionIdentity: true } as const

  constructor(
    private readonly factory: CodexTelemetryFactory,
    private readonly defaultExecutable: string,
    private readonly resolveHookTrust: CodexSessionEndHookTrustResolver,
    private readonly baseArgs: readonly string[],
    private readonly runtimePlatform: NodeJS.Platform
  ) {}

  async prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    return this.prepareForExecutable(command, this.defaultExecutable)
  }

  async prepareForExecutable(command: CreateAgentLaunchPlanCommand, executable: string) {
    const runtime = await this.factory({
      appServerArgs: [...this.baseArgs, ...(command.launchProfile?.arguments ?? [])],
      environment: command.launchProfile?.environment ?? {},
      executable,
      onProviderSessionIdentified: command.onProviderSessionIdentified,
      onTurnCompleted: command.onTurnCompleted,
      workspaceDirectory: command.workspaceDirectory
    })
    command.artifacts.track('codex-notify-reporter', runtime)
    const telemetryArgs = [
      '--config',
      `tui.terminal_title=${serializeCodexTomlStringArray(
        ['thread-title', 'thread-id'],
        this.runtimePlatform
      )}`,
      '--config',
      `notify=${serializeCodexTomlStringArray(runtime.notifyCommand, this.runtimePlatform)}`
    ]
    if (!runtime.sessionEndHook) {
      return {
        args: telemetryArgs,
        env: runtime.env,
        onTerminalTitleChanged: runtime.onTerminalTitleChanged
      }
    }
    let hookTrustConfiguration: string | null = null
    try {
      hookTrustConfiguration = await this.resolveHookTrust({
        executable,
        hookCommand: runtime.sessionEndHook.command,
        hookConfiguration: runtime.sessionEndHook.configuration,
        workspaceDirectory: command.workspaceDirectory
      })
    } catch {
      // Older Codex versions still retain their legacy notify integration.
    }
    if (!hookTrustConfiguration) {
      return {
        args: telemetryArgs,
        env: runtime.env,
        onTerminalTitleChanged: runtime.onTerminalTitleChanged
      }
    }
    return {
      args: [
        '--config',
        runtime.sessionEndHook.configuration,
        '--config',
        hookTrustConfiguration,
        ...telemetryArgs
      ],
      env: runtime.env,
      onTerminalTitleChanged: runtime.onTerminalTitleChanged
    }
  }
}

class CodexCleancodeCapabilityInjector implements AgentCapabilityInjector {
  constructor(private readonly runtimePlatform: NodeJS.Platform) {}

  inject(command: Parameters<AgentCapabilityInjector['inject']>[0]) {
    const serialize = (value: string) => serializeCodexTomlString(value, this.runtimePlatform)
    return {
      args: [
        '--config',
        `mcp_servers.cleancode={url=${serialize(command.serverUrl)},bearer_token_env_var=${serialize('CLEANCODE_MCP_TOKEN')},enabled=true,default_tools_approval_mode=${serialize('approve')}}`,
        '--config',
        `developer_instructions=${serialize(cleancodeMcpDeveloperInstructions)}`
      ],
      env: createMcpEnvironment(command.bearerToken)
    }
  }
}

class CodexLaunchPlanner implements AgentLaunchPlanner {
  constructor(
    private readonly options: {
      readonly baseArgs: readonly string[]
      readonly cleancodeCapability: AgentCapabilityInjector
      readonly command: string
      readonly resume: AgentResumeStrategy
      readonly telemetry: CodexTelemetryContribution
    }
  ) {}

  async createLaunchPlan(command: CreateAgentLaunchPlanCommand) {
    const executable = command.launchProfile?.executable ?? this.options.command
    const telemetry = await this.options.telemetry.prepareForExecutable(command, executable)
    const capability = command.cleancodeMcp
      ? await this.options.cleancodeCapability.inject({
          ...command.cleancodeMcp,
          artifacts: command.artifacts
        })
      : { args: [], env: {} }
    return {
      args: [
        ...this.options.baseArgs,
        ...(command.launchProfile?.arguments ?? []),
        ...(command.providerSessionRef
          ? this.options.resume.createResumeArgs(command.providerSessionRef)
          : []),
        '--no-alt-screen',
        '-C',
        command.workspaceDirectory,
        ...capability.args,
        ...telemetry.args
      ],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        PROMPT_EOL_MARK: '',
        ...(command.launchProfile?.environment ?? {}),
        ...capability.env,
        ...telemetry.env,
        ...createAgentProviderLoopbackEnvironment()
      },
      executable,
      gracefulShutdown: {
        inputIntervalMs: 100,
        inputs: ['\x1b[27;1u', '\x15/quit', '\r', '\r'],
        timeoutMs: 1_800
      },
      onTerminalTitleChanged: telemetry.onTerminalTitleChanged
    }
  }
}

async function createCodexTelemetryRuntime(
  command: {
    readonly appServerArgs: readonly string[]
    readonly environment: Readonly<Record<string, string>>
    readonly executable: string
    readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
    readonly onTurnCompleted?: () => void
    readonly workspaceDirectory: string
  },
  runtimeExecutable: string,
  resolveThreadPrefix: CodexThreadPrefixResolver,
  runtimePlatform: NodeJS.Platform
): Promise<CodexTelemetryRuntime> {
  const reporter = await CodexThreadIdentityReporter.start({
    onThreadIdentified: (threadId) =>
      command.onProviderSessionIdentified({
        formatVersion: 1,
        kind: 'codex-thread',
        value: threadId
      }),
    onTurnCompleted: command.onTurnCompleted,
    resolveThreadIdPrefix: (prefix) =>
      resolveThreadPrefix({
        appServerArgs: command.appServerArgs,
        environment: command.environment,
        executable: command.executable,
        prefix,
        workspaceDirectory: command.workspaceDirectory
      })
  })
  let relay: AgentRuntimeArtifact & { readonly path: string }
  try {
    relay = await createTemporaryProviderConfig(
      'cleancode-codex-hook-',
      'relay.mjs',
      codexHookRelayScript
    )
  } catch (error) {
    await reporter.close()
    throw error
  }
  const sessionEndHook = createCodexSessionEndHook(runtimeExecutable, relay.path, runtimePlatform)
  return {
    dispose: async () => {
      try {
        await reporter.close()
      } finally {
        await relay.dispose()
      }
    },
    env: {
      CLEANCODE_CODEX_NOTIFY_TOKEN: reporter.token,
      CLEANCODE_CODEX_NOTIFY_URL: reporter.url,
      ELECTRON_RUN_AS_NODE: '1'
    },
    notifyCommand: [runtimeExecutable, relay.path],
    onTerminalTitleChanged: (title) => reporter.acceptTerminalTitle(title),
    sessionEndHook
  }
}

function createMcpEnvironment(bearerToken: string): Record<string, string> {
  return { CLEANCODE_MCP_TOKEN: bearerToken }
}

const codexHookRelayScript = [
  "let body=process.argv.length>2?process.argv.at(-1):'';",
  'if(!body) for await (const chunk of process.stdin) body+=chunk;',
  'await fetch(process.env.CLEANCODE_CODEX_NOTIFY_URL,{',
  'method:"POST",',
  'headers:{authorization:`Bearer ${process.env.CLEANCODE_CODEX_NOTIFY_TOKEN}`},',
  'body',
  '}).catch(()=>{});'
].join('')

function createCodexSessionEndHook(
  runtimeExecutable: string,
  relayPath: string,
  runtimePlatform: NodeJS.Platform
) {
  const command =
    runtimePlatform === 'win32'
      ? createWindowsRelayInvocation(runtimeExecutable, relayPath).join(' ')
      : [runtimeExecutable, relayPath].map(quotePosixShellArgument).join(' ')
  const commandWindows =
    runtimePlatform === 'win32'
      ? command
      : createWindowsRelayInvocation(runtimeExecutable, relayPath).join(' ')
  const serialize = (value: string) => serializeCodexTomlString(value, runtimePlatform)
  return {
    command: runtimePlatform === 'win32' ? commandWindows : command,
    configuration: [
      `hooks.SessionEnd=[{hooks=[{type=${serialize('command')},command=`,
      serialize(command),
      ',commandWindows=',
      serialize(commandWindows),
      ',timeout=3}]}]'
    ].join('')
  }
}

function quotePosixShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function createWindowsRelayInvocation(
  runtimeExecutable: string,
  relayPath: string
): readonly string[] {
  const encodedScript = Buffer.from(
    [
      '$encoding = [System.Text.Encoding]::UTF8',
      `$runtime = $encoding.GetString([System.Convert]::FromBase64String('${encodeUtf8(runtimeExecutable)}'))`,
      `$relay = $encoding.GetString([System.Convert]::FromBase64String('${encodeUtf8(relayPath)}'))`,
      '& $runtime $relay',
      'exit $LASTEXITCODE'
    ].join('\n'),
    'utf16le'
  ).toString('base64')
  return [
    'powershell.exe',
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encodedScript
  ]
}

function encodeUtf8(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}
