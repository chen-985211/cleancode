export interface BuiltInAgentProviderSource {
  readonly directoryPath: string
  readonly filePath: string
  readonly providerId: string
}

export interface AgentProviderBoundaryViolation {
  readonly filePath: string
  readonly line: number
  readonly providerId: string | null
  readonly rule:
    | 'no-provider-id-literal'
    | 'no-provider-infrastructure-reference'
    | 'provider-id-discovery-failed'
  readonly message: string
}

export interface AgentProviderBoundaryLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export function discoverBuiltInAgentProviders(options?: {
  readonly cwd?: string
}): BuiltInAgentProviderSource[]

export function collectAgentProviderBoundaryViolations(options?: {
  readonly cwd?: string
}): AgentProviderBoundaryViolation[]

export function runAgentProviderBoundaryGate(options?: {
  readonly cwd?: string
  readonly logger?: AgentProviderBoundaryLogger
}): number
