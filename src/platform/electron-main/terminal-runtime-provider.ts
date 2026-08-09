import { appendFile, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import { TerminalProviderServer } from '../../contexts/run/infrastructure/provider/TerminalProviderServer'
import { terminalProviderProtocolVersion } from '../../contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { rotateProviderLog } from '../../contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import { createTerminalProcessEnvironment } from '../../contexts/run/infrastructure/pty/TerminalProcessEnvironment'
import { resolveTerminalShellExecutable } from '../../contexts/run/infrastructure/pty/TerminalShellExecutableResolver'
import { WindowsConptyWarmup } from '../../contexts/run/infrastructure/pty/WindowsConptyWarmup'

const maxProviderLogBytes = 5 * 1024 * 1024
let diagnosticTail: Promise<void> = Promise.resolve()

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
  const conptyWarmup = new WindowsConptyWarmup({
    environment: createTerminalProcessEnvironment({
      explicit: undefined,
      inherited: process.env,
      platform: 'win32'
    }),
    onFailure: (phase, error) =>
      void writeProviderDiagnostic('conpty-warmup-failed', {
        message: error instanceof Error ? error.message : String(error),
        phase
      }),
    resolvePowerShellExecutable: () =>
      resolveTerminalShellExecutable({
        platform: 'win32',
        resolveAppExecutionAlias: () => null
      }),
    runtimePlatform: process.platform,
    spawnPty: (executable, args, options) => spawnPtyProcess(executable, args, options),
    workingDirectory: homedir()
  })
  const server = new TerminalProviderServer({
    endpoint: metadata.endpoint,
    authToken: metadata.authToken,
    instanceId: metadata.instanceId,
    recoveryDirectory: join(stateDirectory, 'recovery'),
    log: (message, details) => void writeProviderDiagnostic(message, details),
    onExitRequested: () => {
      conptyWarmup.dispose()
      process.exit(0)
    },
    onInitialStateListed: () => conptyWarmup.schedule()
  })
  await server.start()

  let isClosing = false
  const close = () => {
    if (isClosing) return
    isClosing = true
    conptyWarmup.dispose()
    const forceExit = setTimeout(() => process.exit(1), 4_500)
    void server.close().finally(() => {
      clearTimeout(forceExit)
      process.exit(0)
    })
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
  const logPath = join(dirname(metadataPath), 'provider.log')
  diagnosticTail = diagnosticTail
    .catch(() => undefined)
    .then(async () => {
      if ((await fileSize(logPath)) >= maxProviderLogBytes) rotateProviderLog(logPath)
      const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })
      await appendFile(logPath, `${line}\n`, { encoding: 'utf8', mode: 0o600 })
    })
  await diagnosticTail.catch(() => undefined)
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}
