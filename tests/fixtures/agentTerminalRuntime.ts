import type {
  AgentProviderAvailability,
  AgentProviderContribution,
  AgentProviderDescriptor,
  CreateAgentLaunchPlanCommand
} from '../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentProviderRegistryPort } from '../../src/contexts/agent/application/ports/AgentProviderRegistryPort'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../../src/contexts/agent/domain/value-objects/ProviderSessionRef'
import type {
  AgentTerminalRuntimePort,
  OpenAgentTerminalCommand
} from '../../src/contexts/agent/application/ports/AgentTerminalRuntimePort'

export class RecordingAgentProviderRegistry implements AgentProviderRegistryPort {
  readonly launchCommands: CreateAgentLaunchPlanCommand[] = []
  readonly descriptor: AgentProviderDescriptor
  readonly contribution: AgentProviderContribution

  constructor(
    providerId = 'codex',
    capabilities: Partial<AgentProviderDescriptor['capabilities']> = {}
  ) {
    this.descriptor = {
      capabilities: {
        activityTracking: false,
        cleancodeMcp: 'best_effort',
        launchInstructions: true,
        resume: true,
        sessionIdentityCapture: true,
        sessionRefCodec: true,
        ...capabilities
      },
      displayName: providerId,
      icon: {
        paths: [{ d: 'M2 2h20v20H2z' }],
        viewBox: '0 0 24 24'
      },
      id: providerId
    }
    this.contribution = {
      cleancodeCapability: { inject: () => ({ args: [], env: {} }) },
      descriptor: this.descriptor,
      detector: { inspect: async () => this.installedAvailability() },
      launcher: {
        createLaunchPlan: async (command) => {
          this.launchCommands.push(command)
          const env: Readonly<Record<string, string>> = command.cleancodeMcp
            ? { CLEANCODE_MCP_TOKEN: command.cleancodeMcp.bearerToken }
            : {}
          return {
            args: [],
            env,
            executable: 'fake-agent'
          }
        }
      },
      resume: { createResumeArgs: () => [] },
      sessionRefCodec: {
        parse: (sessionRef) => ProviderSessionRef.create(sessionRef).toSnapshot()
      },
      telemetry: {
        prepare: async () => ({ args: [], env: {} }),
        signals: {
          activity: this.descriptor.capabilities.activityTracking,
          sessionIdentity: this.descriptor.capabilities.sessionIdentityCapture
        }
      }
    }
  }

  inspect(): Promise<AgentProviderAvailability> {
    return this.contribution.detector.inspect()
  }

  listDescriptors(): readonly AgentProviderDescriptor[] {
    return [this.descriptor]
  }

  parseSessionRef(providerId: string, sessionRef: ProviderSessionRefSnapshot): ProviderSessionRef {
    const contribution = this.require(providerId)
    return ProviderSessionRef.create(contribution.sessionRefCodec!.parse(sessionRef), providerId)
  }

  require(providerId: string): AgentProviderContribution {
    if (providerId !== this.descriptor.id) throw new Error(`Unknown Provider: ${providerId}`)
    return this.contribution
  }

  private installedAvailability(): AgentProviderAvailability {
    return { providerId: this.descriptor.id, status: 'installed', version: 'test' }
  }
}

export class RecordingAgentTerminalRuntime implements AgentTerminalRuntimePort {
  readonly launches: Parameters<AgentTerminalRuntimePort['launch']>[0][] = []
  readonly opens: OpenAgentTerminalCommand[] = []
  readonly resizes: {
    readonly columns: number
    readonly rows: number
    readonly sessionId: string
  }[] = []
  readonly stops: string[] = []
  readonly writes: { readonly input: string; readonly sessionId: string }[] = []

  async open(command: OpenAgentTerminalCommand) {
    this.opens.push(command)
    const generation = this.opens.length
    return {
      processId: generation,
      terminalId: `terminal-${generation}`,
      viewIdentity: {
        blockId: command.agentId,
        generation,
        owner: { id: command.agentId, kind: 'agent' as const },
        projectId: command.projectId,
        runId: `run-${generation}`,
        sessionId: `terminal-${generation}`,
        workspaceName: command.workspaceName
      }
    }
  }

  launch(command: Parameters<AgentTerminalRuntimePort['launch']>[0]) {
    this.launches.push(command)
    const generation = this.launches.length
    const launchId = `launch-${generation}`
    command.onStarted?.({ generation, launchId })
    return { generation, launchId }
  }

  write(sessionId: string, input: string): void {
    this.writes.push({ input, sessionId })
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.resizes.push({ columns, rows, sessionId })
  }

  async stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId)
  }

  async disposeAll(): Promise<void> {
    this.stops.push('*')
  }

  releaseApplicationShutdown(): void {}
}
