import type {
  AgentProviderSessionRefCodec,
  AgentTelemetryContribution
} from '../../../application/ports/AgentProviderContribution'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'
import { prepareProviderActivityReporter } from '../shared/ProviderActivityReporter'
import { providerActivityReportSource } from '../shared/ProviderActivityReportSource'
import { piSessionExtensionSource } from './PiSessionExtensionSource'
import {
  createProviderSessionFileReporter,
  createSessionReportWriterSource
} from '../terminal-cli/ProviderSessionFileReporter'

export class PiSessionTelemetry implements AgentTelemetryContribution {
  readonly signals = { activity: true, sessionIdentity: true } as const

  constructor(private readonly codec: AgentProviderSessionRefCodec) {}

  async prepare(command: Parameters<AgentTelemetryContribution['prepare']>[0]) {
    const reportPath = await createProviderSessionFileReporter(command, this.codec, 'pi-session')
    const env = await prepareProviderActivityReporter(command, 'pi')
    const extension = await createTemporaryProviderConfig(
      'cleancode-pi-session-',
      'session.mjs',
      createSessionReportWriterSource(reportPath) +
        providerActivityReportSource +
        piSessionExtensionSource
    )
    command.artifacts.track('pi-session-extension', extension)
    return { args: ['--extension', extension.path], env }
  }
}
