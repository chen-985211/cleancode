import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  const directory = await mkdtemp(join(tmpdir(), prefix))
  const path = join(directory, filename)
  try {
    await chmod(directory, 0o700)
    await writeFile(path, contents, { encoding: 'utf8', mode: 0o600 })
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
    path,
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
