import type { AgentCapabilityInjector } from '../../../application/ports/AgentProviderContribution'
import { createTemporaryProviderConfig } from './TemporaryProviderConfig'

export function createTemporaryJsonMcpCapabilityInjector(input: {
  readonly artifactLabel: string
  readonly createSettings: (serverUrl: string) => unknown
  readonly filename?: string
  readonly pathEnvironment: string
  readonly prefix: string
  readonly tokenEnvironment?: string
}): AgentCapabilityInjector {
  return {
    async inject(command) {
      const config = await createTemporaryProviderConfig(
        input.prefix,
        input.filename ?? 'settings.json',
        JSON.stringify(input.createSettings(command.serverUrl))
      )
      command.artifacts.track(input.artifactLabel, config)
      return {
        args: [],
        env: {
          [input.pathEnvironment]: config.path,
          [input.tokenEnvironment ?? 'CLEANCODE_MCP_TOKEN']: command.bearerToken
        }
      }
    }
  }
}
