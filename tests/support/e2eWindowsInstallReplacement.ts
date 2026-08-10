import { rename } from 'node:fs/promises'

import { pollUntilState } from './e2ePolling'

interface RetireWindowsInstallDirectoryOptions {
  readonly intervalMs?: number
  readonly renameDirectory?: (source: string, destination: string) => Promise<void>
  readonly timeoutMs?: number
}

const retryableWindowsRenameCodes = new Set(['EACCES', 'EBUSY', 'EPERM'])

export async function retireWindowsInstallDirectory(
  source: string,
  destination: string,
  options: RetireWindowsInstallDirectoryOptions = {}
): Promise<void> {
  let lastBlockingError: unknown

  try {
    await pollUntilState({
      description: 'the packaged Windows install directory handle to be released',
      observe: async () => {
        try {
          await (options.renameDirectory ?? rename)(source, destination)
          return true
        } catch (error) {
          if (!isRetryableWindowsRenameError(error)) throw error
          lastBlockingError = error
          return false
        }
      },
      accept: Boolean,
      intervalMs: options.intervalMs ?? 100,
      timeoutMs: options.timeoutMs ?? 10_000
    })
  } catch (error) {
    throw new Error('The packaged Windows install directory could not be retired.', {
      cause: lastBlockingError ?? error
    })
  }
}

function isRetryableWindowsRenameError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    retryableWindowsRenameCodes.has(error.code)
  )
}
