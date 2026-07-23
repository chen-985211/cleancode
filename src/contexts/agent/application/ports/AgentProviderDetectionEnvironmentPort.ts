export interface PrepareAgentProviderDetectionEnvironmentOptions {
  readonly refresh?: boolean
}

export interface AgentProviderDetectionEnvironmentPort {
  prepare(options?: PrepareAgentProviderDetectionEnvironmentOptions): Promise<void>
}
