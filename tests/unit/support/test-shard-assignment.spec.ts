import { readdir } from 'node:fs/promises'
import { join, posix } from 'node:path'

import baseline from '../../fixtures/e2eDurations.json'
import { assignTestShards } from '../../support/testShardAssignment'

describe('test shard assignment', () => {
  it.each([1, 2, 3, 7])('covers every discovered file once with %s shards', (count) => {
    const files = ['slow', 'medium', 'fast', 'new-file']
    const shards = assignTestShards(files, { slow: 100, medium: 50, fast: 10, deleted: 999 }, count)
    expect(shards).toHaveLength(count)
    expect(shards.flat().sort()).toEqual([...files].sort())
    expect(
      assignTestShards([...files].reverse(), { slow: 100, medium: 50, fast: 10 }, count)
    ).toEqual(assignTestShards(files, { slow: 100, medium: 50, fast: 10 }, count))
  })

  it('balances long files before placing shorter files', () => {
    const shards = assignTestShards(['a', 'b', 'c', 'd'], { a: 100, b: 90, c: 20, d: 10 }, 2)
    const costs: Record<string, number> = { a: 100, b: 90, c: 20, d: 10 }
    expect(shards.map((files) => files.reduce((sum, file) => sum + costs[file]!, 0))).toEqual([
      110, 110
    ])
  })

  it('keeps new files even without usable history', () => {
    expect(assignTestShards(['c', 'a', 'b'], { a: NaN, b: -1, c: Infinity }, 2)).toEqual([
      ['a', 'c'],
      ['b']
    ])
    expect(assignTestShards([], {}, 3)).toEqual([[], [], []])
  })

  it('rejects invalid shard counts and ambiguous identities', () => {
    for (const count of [0, -1, 1.5, NaN]) {
      expect(() => assignTestShards(['a'], {}, count)).toThrow('positive integer')
    }
    expect(() => assignTestShards(['a', 'a'], {}, 2)).toThrow('stable identity')
  })

  it.each(['linux', 'macos', 'windows'] as const)(
    'includes the complete current E2E suite and new files on %s',
    async (platform) => {
      const files = (await readdir(join(process.cwd(), 'tests', 'e2e')))
        .filter((file) => file.endsWith('.spec.ts'))
        .map((file) => posix.join('tests', 'e2e', file))
      files.push('tests/e2e/future-feature.e2e.spec.ts')
      const shards = assignTestShards(files, baseline.durationMs[platform], 3)
      expect(shards.flat().sort()).toEqual([...files].sort())
    }
  )
})
