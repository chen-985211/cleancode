import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'
import type { AgentActivityStatus } from '../dto/AgentSessionProtocol'

interface AgentProviderCapabilities {
  readonly cleancodeMcp: boolean
  readonly resume: boolean
  readonly structuredLifecycle: boolean
  readonly systemInstructions: boolean
}

export interface AgentProviderDescriptor {
  readonly capabilities: AgentProviderCapabilities
  readonly displayName: string
  readonly id: string
}

export type AgentProviderAvailability =
  | {
      readonly providerId: string
      readonly status: 'installed'
      readonly version: string
    }
  | {
      readonly installCommand: string
      readonly providerId: string
      readonly reason: 'not_found'
      readonly status: 'missing'
      readonly version: null
    }
  | {
      readonly providerId: string
      readonly reason: 'command_failed' | 'invalid_output' | 'permission_denied' | 'timed_out'
      readonly status: 'temporarily_unavailable'
      readonly version: null
    }

export interface AgentProviderDetector {
  inspect(): Promise<AgentProviderAvailability>
}

export interface AgentRuntimeArtifact {
  dispose(): Promise<void>
}

export interface AgentLaunchPlan {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly executable: string
  readonly temporaryArtifacts: readonly AgentRuntimeArtifact[]
}

export interface CreateAgentLaunchPlanCommand {
  readonly cleancodeMcp?: {
    readonly bearerToken: string
    readonly serverUrl: string
  }
  readonly onActivityChanged?: (activity: AgentActivityStatus) => void
  readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
  readonly providerSessionRef?: ProviderSessionRefSnapshot
  readonly workspaceDirectory: string
}

export interface AgentLaunchPlanner {
  createLaunchPlan(command: CreateAgentLaunchPlanCommand): Promise<AgentLaunchPlan>
}

export interface AgentResumeStrategy {
  createResumeArgs(sessionRef: ProviderSessionRefSnapshot): readonly string[]
}

export interface AgentTelemetryContribution {
  prepare(command: {
    readonly onActivityChanged?: (activity: AgentActivityStatus) => void
    readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
    readonly workspaceDirectory: string
  }): Promise<{
    readonly args: readonly string[]
    readonly env: Readonly<Record<string, string>>
    readonly temporaryArtifacts: readonly AgentRuntimeArtifact[]
  }>
}

export interface AgentCapabilityInjector {
  inject(command: { readonly bearerToken: string; readonly serverUrl: string }):
    | Promise<{
        readonly args: readonly string[]
        readonly env: Readonly<Record<string, string>>
        readonly temporaryArtifacts?: readonly AgentRuntimeArtifact[]
      }>
    | {
        readonly args: readonly string[]
        readonly env: Readonly<Record<string, string>>
        readonly temporaryArtifacts?: readonly AgentRuntimeArtifact[]
      }
}

export interface AgentProviderContribution {
  readonly cleancodeCapability?: AgentCapabilityInjector
  readonly descriptor: AgentProviderDescriptor
  readonly detector: AgentProviderDetector
  readonly launcher: AgentLaunchPlanner
  readonly resume?: AgentResumeStrategy
  readonly telemetry?: AgentTelemetryContribution
}
