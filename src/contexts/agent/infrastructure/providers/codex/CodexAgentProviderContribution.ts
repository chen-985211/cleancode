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

export const codexInstallCommands = {
  linux: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  macos: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  windows:
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://chatgpt.com/codex/install.ps1 | iex"'
} as const
interface CodexTelemetryRuntime extends AgentRuntimeArtifact {
  readonly env: Readonly<Record<string, string>>
  readonly notifyCommand: readonly string[]
}

type CodexTelemetryFactory = (command: {
  readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
  readonly workspaceDirectory: string
}) => Promise<CodexTelemetryRuntime>

export interface CodexAgentProviderContributionOptions {
  readonly baseArgs?: readonly string[]
  readonly command?: string
  readonly detector?: AgentProviderDetector
  readonly telemetryFactory?: CodexTelemetryFactory
}

export class CodexAgentProviderContribution implements AgentProviderContribution {
  readonly descriptor = {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: 'required',
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
  readonly telemetry: AgentTelemetryContribution
  readonly cleancodeCapability: AgentCapabilityInjector = new CodexCleancodeCapabilityInjector()
  readonly launcher: AgentLaunchPlanner

  constructor(options: CodexAgentProviderContributionOptions = {}) {
    this.detector =
      options.detector ??
      new NodeAgentProviderCliDetector({
        executable: options.command ?? 'codex',
        installCommand: resolveAgentProviderInstallCommand(codexInstallCommands),
        providerId: this.descriptor.id
      })
    this.telemetry = new CodexTelemetryContribution(
      options.telemetryFactory ?? createCodexTelemetryRuntime
    )
    this.launcher = new CodexLaunchPlanner({
      baseArgs: options.baseArgs ?? [],
      cleancodeCapability: this.cleancodeCapability,
      command: options.command ?? 'codex',
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

  constructor(private readonly factory: CodexTelemetryFactory) {}

  async prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    const runtime = await this.factory(command)
    command.artifacts.track('codex-notify-reporter', runtime)
    return {
      args: ['--config', `notify=${JSON.stringify(runtime.notifyCommand)}`],
      env: runtime.env
    }
  }
}

class CodexCleancodeCapabilityInjector implements AgentCapabilityInjector {
  inject(command: Parameters<AgentCapabilityInjector['inject']>[0]) {
    return {
      args: [
        '--config',
        `mcp_servers.cleancode={url=${JSON.stringify(command.serverUrl)},bearer_token_env_var="CLEANCODE_MCP_TOKEN",enabled=true,required=true,default_tools_approval_mode="approve"}`,
        '--config',
        `developer_instructions=${JSON.stringify(cleancodeMcpDeveloperInstructions)}`
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
      readonly telemetry: AgentTelemetryContribution
    }
  ) {}

  async createLaunchPlan(command: CreateAgentLaunchPlanCommand) {
    const telemetry = await this.options.telemetry.prepare(command)
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
      executable: command.launchProfile?.executable ?? this.options.command
    }
  }
}

async function createCodexTelemetryRuntime(command: {
  readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
  readonly workspaceDirectory: string
}): Promise<CodexTelemetryRuntime> {
  const reporter = await CodexThreadIdentityReporter.start({
    onThreadIdentified: (threadId) =>
      command.onProviderSessionIdentified({
        formatVersion: 1,
        kind: 'codex-thread',
        value: threadId
      }),
    workspaceDirectory: command.workspaceDirectory
  })
  return {
    dispose: () => reporter.close(),
    env: {
      CLEANCODE_CODEX_NOTIFY_TOKEN: reporter.token,
      CLEANCODE_CODEX_NOTIFY_URL: reporter.url
    },
    notifyCommand: [process.execPath, '-e', codexNotifyReporterScript]
  }
}

function createMcpEnvironment(bearerToken: string): Record<string, string> {
  return { CLEANCODE_MCP_TOKEN: bearerToken }
}

const codexNotifyReporterScript = [
  'const body=process.argv.at(-1);',
  'fetch(process.env.CLEANCODE_CODEX_NOTIFY_URL,{',
  'method:"POST",',
  'headers:{authorization:`Bearer ${process.env.CLEANCODE_CODEX_NOTIFY_TOKEN}`},',
  'body',
  '}).catch(()=>{});'
].join('')
