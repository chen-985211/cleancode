import { runGit } from './GitProcess'

export const fetchOptions = [
  '-c',
  'maintenance.auto=false',
  '-c',
  'maintenance.commit-graph.auto=0',
  '-c',
  'gc.auto=0',
  'fetch',
  '--no-tags',
  '--no-write-fetch-head',
  '--no-recurse-submodules',
  '--'
]

export async function readGitCommit(directory: string, ref: string): Promise<string | undefined> {
  try {
    const commit = (await runGit(directory, ['rev-parse', '--verify', `${ref}^{commit}`])).trim()
    return /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(commit) ? commit : undefined
  } catch {
    return undefined
  }
}

export async function fetchTrackingBranch(
  directory: string,
  remote: string,
  source: string,
  destination: string
): Promise<string> {
  await runGit(directory, [...fetchOptions, remote, `+${source}:${destination}`])
  const commit = await readGitCommit(directory, destination)
  if (!commit) throw new Error('Remote branch unavailable')
  return commit
}
