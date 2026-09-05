import { relative } from 'node:path'
import { BaseSequencer, type TestSpecification } from 'vitest/node'

import baseline from '../fixtures/e2eDurations.json'
import { assignTestShards } from './testShardAssignment'

export class E2eSequencer extends BaseSequencer {
  async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const shard = this.ctx.config.shard
    if (!shard) return files
    const platform =
      process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
    const identities = files.map((file) =>
      relative(this.ctx.config.root, file.moduleId).replaceAll('\\', '/')
    )
    const assignments = assignTestShards(identities, baseline.durationMs[platform], shard.count)
    const selected = new Set(assignments[shard.index - 1])
    return files.filter((_, index) => selected.has(identities[index]!))
  }
}
