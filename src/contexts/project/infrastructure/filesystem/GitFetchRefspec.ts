import { runGit } from './GitProcess'

// A fetch refspec maps a remote source to a local destination. Only the
// destination is available when the user selects a remote-tracking ref.
export async function readFetchRefspecs(directory: string) {
  const refspecs = new Map<string, string[]>()
  let config: string
  try {
    config = await runGit(directory, ['config', '--null', '--get-regexp', '^remote\\..+\\.fetch$'])
  } catch (error) {
    // git config exits with 1 and no diagnostics when no keys match.
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 1 &&
      'stderr' in error &&
      error.stderr === ''
    )
      return refspecs
    throw error
  }
  for (const entry of config.split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\n')
    const remote = entry.slice('remote.'.length, separator - '.fetch'.length)
    const specs = refspecs.get(remote) ?? []
    specs.push(entry.slice(separator + 1))
    refspecs.set(remote, specs)
  }
  return refspecs
}

export function resolveTrackingSource(refspecs: ReadonlyMap<string, string[]>, ref: string) {
  let match: { remote: string; source: string } | undefined
  for (const [remote, specs] of refspecs) {
    const excluded = specs.filter((spec) => spec.startsWith('^')).map((spec) => spec.slice(1))
    for (const spec of specs) {
      const [sourcePattern, destination] = spec.replace(/^\+/, '').split(':')
      if (!destination) continue
      const capture = matchRef(destination, ref)
      if (capture === null) continue
      const source = sourcePattern.replace('*', () => capture)
      if (excluded.some((pattern) => matchRef(pattern, source) !== null)) continue
      if (match && (match.remote !== remote || match.source !== source)) return undefined
      match = { remote, source }
    }
  }
  return match
}

function matchRef(pattern: string, ref: string): string | null {
  const wildcard = pattern.indexOf('*')
  if (wildcard < 0) return pattern === ref ? '' : null
  const prefix = pattern.slice(0, wildcard)
  const suffix = pattern.slice(wildcard + 1)
  if (
    !ref.startsWith(prefix) ||
    !ref.endsWith(suffix) ||
    ref.length < prefix.length + suffix.length
  )
    return null
  return ref.slice(prefix.length, ref.length - suffix.length)
}
