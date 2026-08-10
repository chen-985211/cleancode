import { randomBytes, randomUUID } from 'node:crypto'
import { closeSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

import {
  atomicWriteProviderMetadata,
  createProviderEndpoint,
  createProviderUnavailableError,
  openProviderProcessLog,
  removeStaleProviderMetadata,
  rotateProviderLog,
  type TerminalProviderMetadata
} from './PersistentTerminalProviderClientSupport'
import {
  createTerminalProviderLivenessReference,
  type TerminalProviderLivenessReference
} from './TerminalProviderHeartbeat'
import { terminalProviderProtocolVersion } from './TerminalProviderProtocol'

interface TerminalProviderLaunchTarget {
  readonly executablePath: string
  readonly providerEntryPath: string
  readonly runtimeImageKey?: string
}

type TerminalProviderLaunchMetadata = TerminalProviderMetadata & {
  readonly liveness: TerminalProviderLivenessReference
}

export interface TerminalProviderProcessLaunchOptions {
  readonly assertLaunchAllowed?: () => Promise<void>
  readonly executablePath?: string
  readonly metadataPath: string
  readonly providerEntryPath: string
  readonly resolveLaunchTarget?: () => Promise<TerminalProviderLaunchTarget>
  readonly onRuntimeImageSpawnFailure?: (error: unknown) => void
  readonly spawnProcess?: typeof spawn
  readonly stateDirectory: string
}

export interface TerminalProviderProcessExitSignal {
  readonly completion: Promise<void>
  hasExited(): boolean
}

export interface TerminalProviderProcessLaunch {
  readonly exitSignal: TerminalProviderProcessExitSignal
  readonly metadata: TerminalProviderMetadata
}

export async function launchTerminalProviderProcess(
  options: TerminalProviderProcessLaunchOptions
): Promise<TerminalProviderProcessLaunch> {
  const installedTarget: TerminalProviderLaunchTarget = {
    executablePath: options.executablePath ?? process.execPath,
    providerEntryPath: options.providerEntryPath
  }
  const launchTarget = options.resolveLaunchTarget
    ? await options.resolveLaunchTarget()
    : installedTarget
  await options.assertLaunchAllowed?.()
  let metadata = createMetadataForTarget(options.stateDirectory, launchTarget)
  await publishProviderMetadata(options, metadata)
  rotateProviderLog(join(options.stateDirectory, 'provider.log'))
  await options.assertLaunchAllowed?.()
  let child: ChildProcess
  try {
    child = await spawnProviderTarget(options, launchTarget, metadata)
  } catch (error) {
    if (!launchTarget.runtimeImageKey) {
      return cleanupFailedProviderSpawn(options, metadata, error)
    }
    options.onRuntimeImageSpawnFailure?.(error)
    await cleanupFailedProviderSpawnMetadata(options, metadata, error)
    metadata = createMetadataForTarget(options.stateDirectory, installedTarget)
    await publishProviderMetadata(options, metadata)
    await options.assertLaunchAllowed?.()
    try {
      child = await spawnProviderTarget(options, installedTarget, metadata)
    } catch (fallbackError) {
      return cleanupFailedProviderSpawn(options, metadata, fallbackError)
    }
  }
  if (!child.pid) {
    return cleanupFailedProviderSpawn(
      options,
      metadata,
      createProviderUnavailableError('Terminal provider process could not be started.')
    )
  }
  const exitSignal = createProviderProcessExitSignal(child)
  const launched = { ...metadata, processId: child.pid }
  try {
    await publishProviderMetadata(options, launched, () =>
      stopSpawnedProviderProcess(child, exitSignal)
    )
  } catch (error) {
    const cleanupErrors: unknown[] = []
    await stopSpawnedProviderProcess(child, exitSignal).catch((cleanupError) =>
      cleanupErrors.push(cleanupError)
    )
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Terminal Provider launch fencing failed and the spawned process could not be stopped.'
      )
    }
    throw error
  }
  child.unref()
  return { exitSignal, metadata: launched }
}

async function cleanupFailedProviderSpawn(
  options: TerminalProviderProcessLaunchOptions,
  metadata: TerminalProviderMetadata,
  spawnError: unknown
): Promise<never> {
  await cleanupFailedProviderSpawnMetadata(options, metadata, spawnError)
  throw spawnError
}

async function cleanupFailedProviderSpawnMetadata(
  options: TerminalProviderProcessLaunchOptions,
  metadata: TerminalProviderMetadata,
  spawnError: unknown
): Promise<void> {
  const cleanupErrors: unknown[] = []
  await options.assertLaunchAllowed?.().catch((error) => cleanupErrors.push(error))
  const removed = await removeStaleProviderMetadata(metadata, options.metadataPath).catch(
    (error) => {
      cleanupErrors.push(error)
      return false
    }
  )
  await options.assertLaunchAllowed?.().catch((error) => cleanupErrors.push(error))
  if (!removed) {
    cleanupErrors.push(
      createProviderUnavailableError(
        'Terminal provider metadata changed while a failed spawn was being reconciled.'
      )
    )
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      [spawnError, ...cleanupErrors],
      'Terminal Provider process spawn failed and metadata cleanup was incomplete.'
    )
  }
}

async function publishProviderMetadata(
  options: TerminalProviderProcessLaunchOptions,
  metadata: TerminalProviderMetadata,
  onWriteRejected?: (error: unknown) => Promise<void>
): Promise<void> {
  try {
    await atomicWriteProviderMetadata(options.metadataPath, metadata, {
      assertWriteAllowed: options.assertLaunchAllowed,
      onWriteRejected
    })
  } catch (error) {
    const cleanupErrors: unknown[] = []
    await removeStaleProviderMetadata(metadata, options.metadataPath).catch((cleanupError) =>
      cleanupErrors.push(cleanupError)
    )
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Terminal Provider metadata publication fencing failed and cleanup was incomplete.'
      )
    }
    throw error
  }
}

async function stopSpawnedProviderProcess(
  child: ChildProcess,
  exitSignal: TerminalProviderProcessExitSignal
): Promise<void> {
  if (exitSignal.hasExited()) return
  const errors: unknown[] = []
  try {
    child.kill()
  } catch (error) {
    errors.push(error)
  }
  if (!(await waitForProviderProcessExit(exitSignal, 4_500))) {
    try {
      child.kill('SIGKILL')
    } catch (error) {
      errors.push(error)
    }
    if (!(await waitForProviderProcessExit(exitSignal, 1_000))) {
      errors.push(
        new Error('The spawned Terminal Provider process did not exit after termination.')
      )
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    throw new AggregateError(errors, 'The spawned Terminal Provider process could not be stopped.')
  }
}

async function waitForProviderProcessExit(
  exitSignal: TerminalProviderProcessExitSignal,
  timeoutMs: number
): Promise<boolean> {
  if (exitSignal.hasExited()) return true
  return Promise.race([
    exitSignal.completion.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ])
}

function createMetadataForTarget(
  stateDirectory: string,
  target: TerminalProviderLaunchTarget
): TerminalProviderLaunchMetadata {
  const instanceId = randomUUID()
  const metadata: TerminalProviderLaunchMetadata = {
    schemaVersion: 1,
    protocolVersion: terminalProviderProtocolVersion,
    instanceId,
    authToken: randomBytes(32).toString('hex'),
    endpoint: createProviderEndpoint(stateDirectory, instanceId),
    processId: 0,
    startedAt: new Date().toISOString(),
    liveness: createTerminalProviderLivenessReference()
  }
  return target.runtimeImageKey
    ? { ...metadata, runtimeImageKey: target.runtimeImageKey }
    : metadata
}

async function spawnProviderTarget(
  options: TerminalProviderProcessLaunchOptions,
  target: TerminalProviderLaunchTarget,
  metadata: TerminalProviderLaunchMetadata
): Promise<ChildProcess> {
  const processLog = openProviderProcessLog(options.stateDirectory)
  let child: ChildProcess
  try {
    child = (options.spawnProcess ?? spawn)(
      target.executablePath,
      [
        target.providerEntryPath,
        '--metadata',
        options.metadataPath,
        '--instance-id',
        metadata.instanceId,
        '--heartbeat-id',
        metadata.liveness.heartbeatId
      ],
      {
        cwd: options.stateDirectory,
        detached: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', processLog, processLog]
      }
    )
  } finally {
    closeSync(processLog)
  }
  if (!child.pid) await waitForProviderProcessSpawn(child)
  return child
}

function waitForProviderProcessSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      child.off('error', onError)
      child.off('spawn', onSpawn)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onSpawn = (): void => {
      cleanup()
      resolve()
    }
    child.once('error', onError)
    child.once('spawn', onSpawn)
  })
}

function createProviderProcessExitSignal(child: ChildProcess): TerminalProviderProcessExitSignal {
  let exited =
    typeof child.exitCode === 'number' ||
    (typeof child.signalCode === 'string' && child.signalCode.length > 0)
  let resolveCompletion: (() => void) | undefined
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })
  const markExited = (): void => {
    if (exited) return
    exited = true
    resolveCompletion?.()
  }
  if (exited) {
    resolveCompletion?.()
  } else {
    child.once('exit', markExited)
    child.once('error', markExited)
  }
  return { completion, hasExited: () => exited }
}
