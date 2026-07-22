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
  await chmod(directory, 0o700)
  const path = join(directory, filename)
  await writeFile(path, contents, { encoding: 'utf8', mode: 0o600 })
  let disposed = false
  return {
    path,
    async dispose() {
      if (disposed) return
      disposed = true
      await rm(directory, { force: true, recursive: true })
    }
  }
}
