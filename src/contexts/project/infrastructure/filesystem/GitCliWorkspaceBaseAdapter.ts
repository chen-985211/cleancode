import type {
  WorkspaceBaseBranchPort,
  WorkspaceBaseRefReader
} from '../../application/ports/WorkspaceBaseBranchPort'
import { createProjectError } from '../../application/errors/ProjectErrors'
import { fetchTrackingBranch, readGitCommit } from './GitBaseCommit'
import { forEachGitLine, isGitRepository, runGit } from './GitProcess'
import { readFetchRefspecs, resolveTrackingSource } from './GitFetchRefspec'

export class GitCliWorkspaceBaseAdapter implements WorkspaceBaseBranchPort {
  async open(directory: string): Promise<WorkspaceBaseRefReader | null> {
    if (!(await isGitRepository(directory))) return null
    const refspecs = await readFetchRefspecs(directory)
    return {
      visit: (refs, accept) =>
        forEachGitLine(
          directory,
          [
            'for-each-ref',
            '--sort=refname',
            '--format=%(refname)%09%(symref)%09%(HEAD)%09%(upstream)',
            ...refs
          ],
          (line) => {
            const [name, target, head, upstream] = line.split('\t')
            // Git also matches descendants of an exact ref pattern when that ref is missing.
            if (!refs.some((ref) => (ref.endsWith('/') ? name.startsWith(ref) : name === ref)))
              return
            if (name.startsWith('refs/heads/')) {
              if (!target) accept({ kind: 'local', name, checkedOut: head === '*', upstream })
            } else {
              const trackingRef = target || name
              if (
                trackingRef.startsWith('refs/remotes/') &&
                resolveTrackingSource(refspecs, trackingRef)
              ) {
                accept({ kind: 'remote', name, target })
              }
            }
          }
        )
    }
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
