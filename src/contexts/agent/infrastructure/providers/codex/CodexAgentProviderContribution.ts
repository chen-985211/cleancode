import type { CodexCliPort } from '../../../application/ports/CodexCliPort'
import type {
  AgentCapabilityInjector,
  AgentLaunchPlanner,
  AgentProviderContribution,
  AgentProviderDetector,
  AgentResumeStrategy,
  AgentRuntimeArtifact,
  AgentTelemetryContribution,
  CreateAgentLaunchPlanCommand
} from '../../../application/ports/AgentProviderContribution'
import { cleancodeMcpDeveloperInstructions } from '../../../application/dto/AgentToolProtocol'
import { CodexThreadId } from '../../../domain/value-objects/CodexThreadId'
import type { ProviderSessionRefSnapshot } from '../../../domain/value-objects/ProviderSessionRef'
import { CodexThreadIdentityReporter } from '../../pty/CodexThreadIdentityReporter'

const localMcpNoProxyHosts = ['127.0.0.1', 'localhost', '::1']

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
  readonly detector: CodexCliPort
  readonly telemetryFactory?: CodexTelemetryFactory
}

export class CodexAgentProviderContribution implements AgentProviderContribution {
  readonly descriptor = {
    capabilities: {
      cleancodeMcp: true,
      resume: true,
      structuredLifecycle: true,
      systemInstructions: true
    },
    displayName: 'Codex',
    id: 'codex'
  } as const
  readonly detector: AgentProviderDetector
  readonly resume: AgentResumeStrategy = new CodexResumeStrategy()
  readonly telemetry: AgentTelemetryContribution
  readonly cleancodeCapability: AgentCapabilityInjector = new CodexCleancodeCapabilityInjector()
  readonly launcher: AgentLaunchPlanner

  constructor(options: CodexAgentProviderContributionOptions) {
    this.detector = new CodexProviderDetector(options.detector)
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

class CodexProviderDetector implements AgentProviderDetector {
  constructor(private readonly codexCli: CodexCliPort) {}

  async inspect() {
    const availability = await this.codexCli.inspect()
    return { ...availability, providerId: 'codex' } as const
  }
}

class CodexResumeStrategy implements AgentResumeStrategy {
  createResumeArgs(sessionRef: ProviderSessionRefSnapshot): readonly string[] {
    if (sessionRef.formatVersion !== 1 || sessionRef.kind !== 'codex-thread') {
      throw new Error('Unsupported Codex Provider session reference.')
    }
    return ['resume', CodexThreadId.create(sessionRef.value).value]
  }
}

class CodexTelemetryContribution implements AgentTelemetryContribution {
  constructor(private readonly factory: CodexTelemetryFactory) {}

  async prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    const runtime = await this.factory(command)
    return {
      args: ['--config', `notify=${JSON.stringify(runtime.notifyCommand)}`],
      env: runtime.env,
      temporaryArtifacts: [runtime]
    }
  }
}

class CodexCleancodeCapabilityInjector implements AgentCapabilityInjector {
  inject(command: { readonly bearerToken: string; readonly serverUrl: string }) {
    return {
      args: [
        '--config',
        `mcp_servers.cleancode={url=${JSON.stringify(command.serverUrl)},bearer_token_env_var="CLEANCODE_MCP_TOKEN",enabled=true,required=true,default_tools_approval_mode="approve"}`,
        '--config',
        `developer_instructions=${JSON.stringify(cleancodeMcpDeveloperInstructions)}`
      ],
      env: createMcpEnvironment(inheritedEnvironment(), command.bearerToken)
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
      ? await this.options.cleancodeCapability.inject(command.cleancodeMcp)
      : { args: [], env: {}, temporaryArtifacts: [] }
    return {
      args: [
        ...this.options.baseArgs,
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
        ...capability.env,
        ...telemetry.env
      },
      executable: this.options.command,
      temporaryArtifacts: [
        ...telemetry.temporaryArtifacts,
        ...(capability.temporaryArtifacts ?? [])
      ]
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

function inheritedEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
}

function createMcpEnvironment(
  environment: Record<string, string>,
  bearerToken: string
): Record<string, string> {
  const noProxy = mergeNoProxyHosts(
    environment.NO_PROXY,
    environment.no_proxy,
    localMcpNoProxyHosts
  )
  return { CLEANCODE_MCP_TOKEN: bearerToken, NO_PROXY: noProxy, no_proxy: noProxy }
}

function mergeNoProxyHosts(
  uppercaseNoProxy: string | undefined,
  lowercaseNoProxy: string | undefined,
  requiredHosts: readonly string[]
): string {
  const hosts: string[] = []
  const normalizedHosts = new Set<string>()
  for (const value of [uppercaseNoProxy, lowercaseNoProxy]) {
    for (const host of value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []) {
      addNoProxyHost(hosts, normalizedHosts, host)
    }
  }
  for (const host of requiredHosts) addNoProxyHost(hosts, normalizedHosts, host)
  return hosts.join(',')
}

function addNoProxyHost(hosts: string[], normalizedHosts: Set<string>, host: string): void {
  const normalizedHost = host.toLowerCase()
  if (normalizedHosts.has(normalizedHost)) return
  normalizedHosts.add(normalizedHost)
  hosts.push(host)
}

const codexNotifyReporterScript = [
  'const body=process.argv.at(-1);',
  'fetch(process.env.CLEANCODE_CODEX_NOTIFY_URL,{',
  'method:"POST",',
  'headers:{authorization:`Bearer ${process.env.CLEANCODE_CODEX_NOTIFY_TOKEN}`},',
  'body',
  '}).catch(()=>{});'
].join('')
