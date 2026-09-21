const transientRuntimeImagePublishErrorCodes = new Set([
  'EACCES',
  'EBUSY',
  'EEXIST',
  'ENOTEMPTY',
  'EPERM'
])

export function isTransientRuntimeImagePublishError(error: unknown): boolean {
  const pending: unknown[] = [error]
  const visited = new Set<object>()
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current !== 'object' || current === null || visited.has(current)) continue
    visited.add(current)
    if (
      'code' in current &&
      typeof current.code === 'string' &&
      transientRuntimeImagePublishErrorCodes.has(current.code)
    ) {
      return true
    }
    if (current instanceof AggregateError) pending.push(...current.errors)
    if ('cause' in current) pending.push(current.cause)
  }
  return false
}
