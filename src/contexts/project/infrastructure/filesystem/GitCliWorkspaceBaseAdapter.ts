import type { WorkspaceBaseBranches } from '../../application/dto/WorkspaceBaseBranches'
import type { WorkspaceBaseBranchPort } from '../../application/ports/WorkspaceBaseBranchPort'
import { createProjectError } from '../../application/errors/ProjectErrors'
import { fetchTrackingBranch, readGitCommit } from './GitBaseCommit'
import { isGitRepository, runGit } from './GitProcess'
import { readFetchRefspecs, resolveTrackingSource } from './GitFetchRefspec'

export class GitCliWorkspaceBaseAdapter implements WorkspaceBaseBranchPort {
  async list(directory: string, currentBranch: string | null): Promise<WorkspaceBaseBranches> {
    if (!(await isGitRepository(directory))) return { branches: [], defaultBranch: null }
    const output = await runGit(directory, [
      'for-each-ref',
      '--format=%(refname)%09%(symref)%09%(HEAD)%09%(upstream)',
      'refs/heads/',
      'refs/remotes/'
    ])
    const refs = output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, target, head, upstream] = line.split('\t')
        return { name, target, checkedOut: head === '*', upstream }
      })
    const locals = refs.filter((ref) => !ref.target && ref.name.startsWith('refs/heads/'))
    const local =
      locals.find((ref) => currentBranch && ref.name === `refs/heads/${currentBranch}`) ??
      locals.find((ref) => ref.checkedOut) ??
      locals[0]

    const remotes = refs.filter((ref) => ref.name.startsWith('refs/remotes/'))
    const remoteBranches = new Set(remotes.filter((ref) => !ref.target).map((ref) => ref.name))
    const remoteDefaults = remotes.filter((ref) => ref.target && ref.name.endsWith('/HEAD'))
    const candidates = [
      remoteDefaults.find((ref) => ref.name === 'refs/remotes/origin/HEAD')?.target,
      ...remoteDefaults.map((ref) => ref.target),
      'refs/remotes/origin/main',
      'refs/remotes/origin/master',
      local?.upstream,
      ...remoteBranches
    ]
    let remote: string | undefined
    if (remoteBranches.size) {
      const refspecs = await readFetchRefspecs(directory)
      remote = candidates.find(
        (ref) => ref && remoteBranches.has(ref) && resolveTrackingSource(refspecs, ref)
      )
    }
    const branches = [remote, local?.name].filter((ref) => ref !== undefined)
    return { branches, defaultBranch: branches[0] ?? null }
  }

  async resolve(directory: string, ref: string): Promise<string> {
    try {
      await runGit(directory, ['check-ref-format', ref])
      if (ref.startsWith('refs/heads/')) {
        const commit = await readGitCommit(directory, ref)
        if (commit) return commit
      } else if (ref.startsWith('refs/remotes/')) {
        const tracking = resolveTrackingSource(await readFetchRefspecs(directory), ref)
        if (tracking)
          return await fetchTrackingBranch(directory, tracking.remote, tracking.source, ref)
      }
    } catch {
      // A failed refresh must never use a stale tracking ref.
    }
    throw createProjectError(
      'GIT_WORKSPACE_BASE_UNAVAILABLE',
      'Workspace base branch is unavailable.'
    )
  }
}
