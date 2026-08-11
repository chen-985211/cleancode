import { consoleLogger } from '../logging/ConsoleLogSink'

export function logProviderRuntimeImageMaterializationError(error: unknown): void {
  consoleLogger.warn({
    scope: 'run.terminal-provider',
    operation: 'materializeRuntimeImage',
    outcome: 'failure',
    error: { message: error instanceof Error ? error.message : String(error) }
  })
}

export function logProviderRuntimeImagePruneError(error: unknown): void {
  consoleLogger.warn({
    scope: 'run.terminal-provider',
    operation: 'pruneRuntimeImages',
    outcome: 'failure',
    error: { message: error instanceof Error ? error.message : String(error) }
  })
}
