import type { IssueWorkspaceBasePort } from '../../application/ports/IssueWorkspaceBasePort'
import { normalizeIssueRepository } from '../../domain/value-objects/ProjectIssue'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { runGit } from './GitProcess'

export class GitCliIssueBaseAdapter implements IssueWorkspaceBasePort {
  async resolve(directory: string, repository: string, branch: string): Promise<string> {
    const repo = normalizeIssueRepository(repository)
    try {
      if (!branch.trim() || branch.startsWith('-')) throw new Error('Invalid branch')
      await runGit(directory, ['check-ref-format', `refs/heads/${branch}`])
      const remotes = (await runGit(directory, ['remote'])).trim().split('\n').filter(Boolean)
      let source = `https://github.com/${repo}.git`
      for (const remote of remotes) {
        const url = (await runGit(directory, ['remote', 'get-url', remote])).trim()
        const match =
          /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(.+?)(?:\.git)?$/.exec(
            url
          )
        if (match?.[1].toLowerCase() === repo.toLowerCase()) {
          source = remote
          break
        }
      }
      const output = await runGit(directory, [
        'ls-remote',
        '--exit-code',
        '--heads',
        '--',
        source,
        `refs/heads/${branch}`
      ])
      const line = output
        .trim()
        .split('\n')
        .find((item) => item.split('\t')[1] === `refs/heads/${branch}`)
      const sha = line?.split('\t')[0]
      if (!sha || !/^[a-f0-9]{40,64}$/.test(sha)) throw new Error('Branch unavailable')
      await runGit(directory, [
        'fetch',
        '--no-tags',
        '--no-write-fetch-head',
        '--no-recurse-submodules',
        '--',
        source,
        sha
      ])
      return sha
    } catch {
      throw createExpectedAppError(
        'GITHUB_BASE_UNAVAILABLE',
        'Issue workspace base is unavailable.'
      )
    }
  }
}
