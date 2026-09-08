import { pathToFileURL } from 'node:url'

import type {
  AgentProviderSessionRefCodec,
  AgentTelemetryContribution,
  CreateAgentLaunchPlanCommand
} from '../../../application/ports/AgentProviderContribution'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import {
  createProviderSessionFileReporter,
  createSessionReportWriterSource
} from '../terminal-cli/ProviderSessionFileReporter'
import { hermesSessionBridgeSource } from './HermesSessionBridgeSource'
import { prepareProviderActivityReporter } from '../shared/ProviderActivityReporter'
import { providerActivityReportSource } from '../shared/ProviderActivityReportSource'

export class HermesSessionTelemetry implements AgentTelemetryContribution {
  readonly signals = { activity: true, sessionIdentity: true } as const

  constructor(private readonly codec: AgentProviderSessionRefCodec) {}

  async prepare(command: CreateAgentLaunchPlanCommand) {
    const reportPath = await createProviderSessionFileReporter(
      command,
      this.codec,
      'hermes-session'
    )
    const env = await prepareProviderActivityReporter(command, 'hermes')
    const bridge = await createTemporaryProviderConfig(
      'cleancode-hermes-session-',
      'session.mjs',
      createSessionReportWriterSource(reportPath) +
        providerActivityReportSource +
        hermesSessionBridgeSource
    )
    command.artifacts.track('hermes-session-bridge', bridge)
    const nodeOptions =
      command.launchProfile?.environment.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? ''
    return {
      args: [],
      env: {
        ...env,
        NODE_OPTIONS:
          `${nodeOptions} --import=${JSON.stringify(pathToFileURL(bridge.path).href)}`.trim()
      }
    }
  }
}
