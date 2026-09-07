import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentRuntimeArtifact } from '../../../application/ports/AgentProviderContribution'

export interface TemporaryProviderConfig extends AgentRuntimeArtifact {
  readonly path: string
}

export async function createTemporaryProviderConfig(
  prefix: string,
  filename: string,
  contents: string
): Promise<TemporaryProviderConfig> {
  let directory = await mkdtemp(join(tmpdir(), prefix))
  try {
    // Windows TEMP may contain an 8.3 alias. libuv file watchers need the long path.
    directory = await realpath(directory)
    await chmod(directory, 0o700)
    await writeFile(join(directory, filename), contents, { encoding: 'utf8', mode: 0o600 })
  } catch (setupError) {
    try {
      await removeTemporaryProviderDirectory(directory)
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        'Temporary Agent Provider config setup and rollback both failed.'
      )
    }
    throw setupError
  }

  let disposed = false
  let disposalPromise: Promise<void> | null = null
  return {
    path: join(directory, filename),
    dispose() {
      if (disposed) return Promise.resolve()
      if (disposalPromise) return disposalPromise

      const disposal = removeTemporaryProviderDirectory(directory).then(() => {
        disposed = true
      })
      disposalPromise = disposal
      const clearDisposal = (): void => {
        if (disposalPromise === disposal) disposalPromise = null
      }
      void disposal.then(clearDisposal, clearDisposal)
      return disposal
    }
  }
}

function removeTemporaryProviderDirectory(directory: string): Promise<void> {
  return rm(directory, { force: true, recursive: true })
}
