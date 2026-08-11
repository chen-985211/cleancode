import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'
import type { AgentActivityStatus } from '../dto/AgentSessionProtocol'

interface AgentProviderCapabilities {
  readonly activityTracking: boolean
  readonly cleancodeMcp: boolean
  readonly launchInstructions: boolean
  readonly resume: boolean
  readonly sessionIdentityCapture: boolean
  readonly sessionRefCodec: boolean
}

interface AgentProviderIconPath {
  readonly d: string
  readonly fill?: 'currentColor' | `#${string}` | `url(#${string})`
  readonly fillRule?: 'evenodd' | 'nonzero'
  readonly transform?: string
}

interface AgentProviderIconLinearGradient {
  readonly id: string
  readonly stops: readonly {
    readonly offset: string
    readonly stopColor: string
  }[]
  readonly x1: string
  readonly x2: string
  readonly y1: string
  readonly y2: string
}

interface AgentProviderVectorIcon {
  readonly linearGradients?: readonly AgentProviderIconLinearGradient[]
  readonly paths: readonly AgentProviderIconPath[]
  readonly viewBox: string
}

interface AgentProviderRasterIcon {
  readonly imageDataUrl: `data:image/png;base64,${string}`
  readonly imageType: 'png'
}

export type AgentProviderIcon = AgentProviderVectorIcon | AgentProviderRasterIcon

export interface AgentProviderPermissionConfiguration {
  readonly arguments?: readonly string[]
  readonly environment?: Readonly<Record<string, string>>
}

export interface AgentProviderLaunchConfiguration {
  readonly defaultArguments: readonly string[]
  readonly defaultEnvironment: Readonly<Record<string, string>>
  readonly executable: string
  readonly permission?: AgentProviderPermissionConfiguration
}

export interface AgentProviderLaunchProfile {
  readonly arguments: readonly string[]
  readonly environment: Readonly<Record<string, string>>
  readonly executable: string
}

export interface AgentProviderDescriptor {
  readonly capabilities: AgentProviderCapabilities
  readonly displayName: string
  readonly documentationUrl?: string
  readonly icon: AgentProviderIcon
  readonly id: string
  readonly launch?: AgentProviderLaunchConfiguration
}

export type AgentProviderAvailability =
  | {
      readonly providerId: string
      readonly status: 'installed'
      readonly version: string
    }
  | {
      readonly installCommand: string
      readonly minimumVersion: string
      readonly providerId: string
      readonly status: 'upgrade_required'
      readonly version: string
    }
  | {
      readonly installCommand?: string
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

interface AgentLaunchArtifactRegistrar {
  track<TArtifact extends AgentRuntimeArtifact>(label: string, artifact: TArtifact): TArtifact
}

export interface AgentLaunchPlan {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly executable: string
  readonly gracefulShutdown?: {
    readonly inputIntervalMs: number
    readonly inputs: readonly string[]
    readonly timeoutMs: number
  }
  readonly onTerminalTitleChanged?: (title: string) => void
  readonly providerSessionRefOnStarted?: ProviderSessionRefSnapshot
}

export interface CreateAgentLaunchPlanCommand {
  readonly artifacts: AgentLaunchArtifactRegistrar
  readonly cleancodeMcp?: {
    readonly bearerToken: string
    readonly serverUrl: string
  }
  readonly launchProfile?: AgentProviderLaunchProfile
  readonly onActivityChanged?: (activity: AgentActivityStatus) => void
  readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
  readonly onTurnCompleted?: () => void
  readonly providerSessionRef?: ProviderSessionRefSnapshot
  readonly workspaceDirectory: string
}

export interface AgentLaunchPlanner {
  createLaunchPlan(command: CreateAgentLaunchPlanCommand): Promise<AgentLaunchPlan>
}

export interface AgentResumeStrategy {
  createResumeArgs(sessionRef: ProviderSessionRefSnapshot): readonly string[]
}

export interface AgentFreshSessionStrategy {
  createFreshSession(): {
    readonly args: readonly string[]
    readonly sessionRef: ProviderSessionRefSnapshot
  }
}

export interface AgentProviderSessionRefCodec {
  parse(sessionRef: ProviderSessionRefSnapshot): ProviderSessionRefSnapshot
}

export interface AgentTelemetryContribution {
  readonly signals: {
    readonly activity: boolean
    readonly sessionIdentity: boolean
  }
  prepare(command: {
    readonly artifacts: AgentLaunchArtifactRegistrar
    readonly onActivityChanged?: (activity: AgentActivityStatus) => void
    readonly onProviderSessionIdentified: (sessionRef: ProviderSessionRefSnapshot) => void
    readonly onTurnCompleted?: () => void
    readonly workspaceDirectory: string
  }): Promise<{
    readonly args: readonly string[]
    readonly env: Readonly<Record<string, string>>
    readonly onTerminalTitleChanged?: (title: string) => void
  }>
}

export interface AgentCapabilityInjector {
  inject(command: {
    readonly artifacts: AgentLaunchArtifactRegistrar
    readonly bearerToken: string
    readonly serverUrl: string
  }):
    | Promise<{
        readonly args: readonly string[]
        readonly env: Readonly<Record<string, string>>
      }>
    | {
        readonly args: readonly string[]
        readonly env: Readonly<Record<string, string>>
      }
}

export interface AgentProviderContribution {
  readonly cleancodeCapability?: AgentCapabilityInjector
  readonly descriptor: AgentProviderDescriptor
  readonly detector: AgentProviderDetector
  readonly freshSession?: AgentFreshSessionStrategy
  readonly launcher: AgentLaunchPlanner
  readonly resume?: AgentResumeStrategy
  readonly sessionRefCodec?: AgentProviderSessionRefCodec
  readonly telemetry?: AgentTelemetryContribution
}
