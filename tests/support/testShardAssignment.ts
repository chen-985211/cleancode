export function assignTestShards(
  files: readonly string[],
  durations: Readonly<Record<string, number>>,
  shardCount: number
): string[][] {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) {
    throw new Error('Shard count must be a positive integer.')
  }
  if (new Set(files).size !== files.length) {
    throw new Error('Each test file must have one stable identity.')
  }
  const estimates = Object.values(durations).filter((value) => Number.isFinite(value) && value > 0)
  estimates.sort((left, right) => left - right)
  const fallback = estimates[Math.floor(estimates.length / 2)] ?? 30_000
  const duration = (file: string): number => {
    const value = durations[file]
    return Number.isFinite(value) && value! > 0 ? value! : fallback
  }
  const compareNames = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0
  const ordered = [...files].sort(
    (left, right) => duration(right) - duration(left) || compareNames(left, right)
  )
  const shards = Array.from({ length: shardCount }, () => ({ files: [] as string[], duration: 0 }))
  for (const file of ordered) {
    const target = shards.reduce((least, shard) =>
      shard.duration < least.duration ? shard : least
    )
    target.files.push(file)
    target.duration += duration(file)
  }
  return shards.map(({ files: assigned }) => assigned)
}
