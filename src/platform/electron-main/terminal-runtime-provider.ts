import { appendFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { TerminalProviderServer } from '../../contexts/run/infrastructure/provider/TerminalProviderServer'
import { terminalProviderProtocolVersion } from '../../contexts/run/infrastructure/provider/TerminalProviderProtocol'

interface ProviderMetadata {
  readonly schemaVersion: 1
  readonly protocolVersion: number
  readonly instanceId: string
  readonly authToken: string
  readonly endpoint: string
}

void startProvider().catch(async (error) => {
  await writeProviderDiagnostic('provider-start-failed', {
    message: error instanceof Error ? error.message : String(error)
  })
  process.exitCode = 1
})

async function startProvider(): Promise<void> {
  const metadataPath = readArgument('--metadata')
  const metadata = await readMetadata(metadataPath)
  const stateDirectory = dirname(metadataPath)
  const server = new TerminalProviderServer({
    endpoint: metadata.endpoint,
    authToken: metadata.authToken,
    instanceId: metadata.instanceId,
    recoveryDirectory: join(stateDirectory, 'recovery'),
    log: (message, details) => void writeProviderDiagnostic(message, details),
    onExitRequested: () => process.exit(0)
  })
  await server.start()

  const close = () => {
    void server.close().finally(() => process.exit(0))
  }
  process.once('SIGTERM', close)
  process.once('SIGINT', close)
}

function readArgument(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`Missing provider argument: ${name}`)
  return value
}

async function readMetadata(path: string): Promise<ProviderMetadata> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('protocolVersion' in value) ||
    value.protocolVersion !== terminalProviderProtocolVersion ||
    !('instanceId' in value) ||
    typeof value.instanceId !== 'string' ||
    !('authToken' in value) ||
    typeof value.authToken !== 'string' ||
    !('endpoint' in value) ||
    typeof value.endpoint !== 'string'
  ) {
    throw new Error('Terminal provider metadata is invalid.')
  }
  return value as ProviderMetadata
}

async function writeProviderDiagnostic(
  event: string,
  details: Readonly<Record<string, unknown>> = {}
): Promise<void> {
  const metadataPath = process.argv[process.argv.indexOf('--metadata') + 1]
  if (!metadataPath) return
  const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })
  await appendFile(join(dirname(metadataPath), 'provider.log'), `${line}\n`, {
    encoding: 'utf8',
    mode: 0o600
  }).catch(() => undefined)
}
