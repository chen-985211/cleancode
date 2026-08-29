import { appendFile, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import { TerminalProviderServer } from '../../contexts/run/infrastructure/provider/TerminalProviderServer'
import { terminalProviderProtocolVersion } from '../../contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { rotateProviderLog } from '../../contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import {
  createTerminalProviderHeartbeat,
  isTerminalProviderLivenessReference,
  type TerminalProviderHeartbeatLease,
  type TerminalProviderLivenessReference
} from '../../contexts/run/infrastructure/provider/TerminalProviderHeartbeat'
import { createTerminalProcessEnvironment } from '../../contexts/run/infrastructure/pty/TerminalProcessEnvironment'
import { NodePtyTerminalProcessAdapter } from '../../contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { installTerminalShellIntegration } from '../../contexts/run/infrastructure/pty/TerminalShellIntegration'
import { resolveTerminalShellExecutable } from '../../contexts/run/infrastructure/pty/TerminalShellExecutableResolver'
import { WindowsConptyWarmup } from '../../contexts/run/infrastructure/pty/WindowsConptyWarmup'

const maxProviderLogBytes = 5 * 1024 * 1024
const providerMetadataPublishTimeoutMs = 5_000
let diagnosticTail: Promise<void> = Promise.resolve()

interface ProviderMetadata {
  readonly schemaVersion: 1
  readonly protocolVersion: number
  readonly instanceId: string
  readonly authToken: string
  readonly endpoint: string
  readonly processId: number
  readonly startedAt: string
  readonly liveness: TerminalProviderLivenessReference
}

void startProvider().catch(async (error) => {
  await writeProviderDiagnostic('provider-start-failed', {
    message: error instanceof Error ? error.message : String(error)
  })
  process.exitCode = 1
})

async function startProvider(): Promise<void> {
  const metadataPath = readArgument('--metadata')
  const expectedInstanceId = readArgument('--instance-id')
  const expectedHeartbeatId = readArgument('--heartbeat-id')
  const metadata = await waitForPublishedMetadata(
    metadataPath,
    expectedInstanceId,
    expectedHeartbeatId
  )
  const stateDirectory = dirname(metadataPath)
  const shellIntegration = await installTerminalShellIntegration(
    join(stateDirectory, 'shell-integration')
  ).catch(async (error) => {
    await writeProviderDiagnostic('shell-integration-install-failed', {
      message: error instanceof Error ? error.message : String(error)
    })
    return undefined
  })
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
  let heartbeat: TerminalProviderHeartbeatLease | null = null
  let server: TerminalProviderServer | null = null
  let isClosing = false
  const close = (exitCode = 0): void => {
    if (isClosing) return
    isClosing = true
    conptyWarmup.dispose()
    const forceExit = setTimeout(() => process.exit(1), 4_500)
    void Promise.allSettled([heartbeat?.close(), server?.close()]).then(async (results) => {
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
      )
      if (failures.length > 0) {
        await writeProviderDiagnostic('provider-close-failed', {
          messages: failures.map((error) =>
            error instanceof Error ? error.message : String(error)
          )
        })
      }
      clearTimeout(forceExit)
      process.exit(failures.length > 0 ? 1 : exitCode)
    })
  }
  heartbeat = await createTerminalProviderHeartbeat({
    stateDirectory,
    owner: metadata,
    onFailure: (error) => {
      void writeProviderDiagnostic('provider-heartbeat-failed', {
        message: error instanceof Error ? error.message : String(error)
      }).finally(() => close(1))
    }
  })
  try {
    server = new TerminalProviderServer({
      endpoint: metadata.endpoint,
      authToken: metadata.authToken,
      instanceId: metadata.instanceId,
      processes: new NodePtyTerminalProcessAdapter({ shellIntegration }),
      recoveryDirectory: join(stateDirectory, 'recovery'),
      log: (message, details) => void writeProviderDiagnostic(message, details),
      onExitRequested: () => close(),
      onInitialStateListed: () => conptyWarmup.schedule()
    })
    await heartbeat.refresh()
    await server.start()
    await heartbeat.refresh()
  } catch (error) {
    conptyWarmup.dispose()
    const cleanup = await Promise.allSettled([heartbeat.close(), server?.close()])
    const cleanupErrors = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    )
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Terminal Provider startup failed and cleanup was incomplete.'
      )
    }
    throw error
  }

  process.once('SIGTERM', () => close())
  process.once('SIGINT', () => close())
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
    typeof value.endpoint !== 'string' ||
    !('processId' in value) ||
    typeof value.processId !== 'number' ||
    !Number.isSafeInteger(value.processId) ||
    value.processId < 0 ||
    !('startedAt' in value) ||
    typeof value.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !('liveness' in value) ||
    !isTerminalProviderLivenessReference(value.liveness)
  ) {
    throw new Error('Terminal provider metadata is invalid.')
  }
  return value as ProviderMetadata
}

async function waitForPublishedMetadata(
  path: string,
  expectedInstanceId: string,
  expectedHeartbeatId: string
): Promise<ProviderMetadata> {
  const deadline = Date.now() + providerMetadataPublishTimeoutMs
  for (;;) {
    const metadata = await readMetadata(path)
    if (
      metadata.instanceId !== expectedInstanceId ||
      metadata.liveness.heartbeatId !== expectedHeartbeatId
    ) {
      throw new Error('Terminal provider metadata generation changed before startup.')
    }
    if (metadata.processId === process.pid) return metadata
    if (metadata.processId !== 0) {
      throw new Error('Terminal provider metadata process identity is invalid.')
    }
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for Terminal provider process metadata publication.')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
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
