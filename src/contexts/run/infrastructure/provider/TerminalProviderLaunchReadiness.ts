import { isAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  createProviderUnavailableError,
  delayProviderOperation,
  getProviderErrorMessage,
  readProviderMetadata,
  type TerminalProviderMetadata
} from './PersistentTerminalProviderClientSupport'
import type { TerminalProviderProcessExitSignal } from './TerminalProviderProcessLauncher'
import type { TerminalProviderRpcConnection } from './TerminalProviderRpcConnection'

const providerStartupTimeoutMs = 5_000
const providerControllerClaimTimeoutMs = 5_000

export async function waitForTerminalProviderLaunch(input: {
  readonly connectMetadata: (metadata: TerminalProviderMetadata) => Promise<void>
  readonly exitSignal?: TerminalProviderProcessExitSignal
  readonly getCurrentConnectionInstanceId: () => string | undefined
  readonly launchedMetadata?: TerminalProviderMetadata
  readonly metadataPath: string
}): Promise<TerminalProviderMetadata> {
  const deadline = Date.now() + providerStartupTimeoutMs
  let lastError: unknown = null
  while (Date.now() < deadline) {
    if (input.exitSignal?.hasExited()) {
      throw createProviderUnavailableError(
        'Terminal provider process exited before it became ready.'
      )
    }
    const metadata = input.launchedMetadata ?? (await readProviderMetadata(input.metadataPath))
    if (!metadata) {
      await delayProviderOperation(50)
      continue
    }
    if (input.getCurrentConnectionInstanceId() === metadata.instanceId) return metadata
    try {
      await input.connectMetadata(metadata)
      return metadata
    } catch (error) {
      lastError = error
      if (!input.exitSignal) {
        await delayProviderOperation(50)
        continue
      }
      const processExited = await Promise.race([
        input.exitSignal.completion.then(() => true),
        delayProviderOperation(50).then(() => false)
      ])
      if (processExited) {
        throw createProviderUnavailableError(
          'Terminal provider process exited before it became ready.'
        )
      }
    }
  }
  throw createProviderUnavailableError(
    `Terminal provider did not become ready: ${getProviderErrorMessage(lastError)}`
  )
}

export async function claimTerminalProviderController(
  connection: TerminalProviderRpcConnection,
  controllerId: string
): Promise<void> {
  const deadline = Date.now() + providerControllerClaimTimeoutMs
  while (true) {
    try {
      await connection.claimController(controllerId, process.pid)
      return
    } catch (error) {
      if (!isAppError(error) || error.code !== 'TERMINAL_PROVIDER_CONTROLLER_BUSY') throw error
      if (Date.now() >= deadline) throw error
      const retryAfterMs = error.details?.retryAfterMs
      await delayProviderOperation(
        typeof retryAfterMs === 'number' ? Math.max(1, Math.min(500, retryAfterMs)) : 50
      )
    }
  }
}
