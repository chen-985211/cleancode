import type { IssueWorkspaceBasePort } from '../../application/ports/IssueWorkspaceBasePort'
import { normalizeIssueRepository } from '../../domain/value-objects/ProjectIssue'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { runGit } from './GitProcess'

const freshnessMs = 30_000
const cacheLimit = 64
const fetchOptions = [
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

export class GitCliIssueBaseAdapter implements IssueWorkspaceBasePort {
  private readonly recent = new Map<string, { commit: string; expiresAt: number }>()
  private readonly pending = new Map<string, Promise<string>>()

  async resolve(directory: string, repository: string, branch: string): Promise<string> {
    const repo = normalizeIssueRepository(repository)
    try {
      if (!branch || branch !== branch.trim() || branch.startsWith('-'))
        throw new Error('Invalid base')
      if (/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(branch)) {
        const commit = await this.readCommit(directory, branch)
        if (!commit) throw new Error('Commit unavailable')
        return commit
      }
      const explicitRemote = branch.startsWith('refs/remotes/')
      const localRef = branch.startsWith('refs/heads/') ? branch : `refs/heads/${branch}`
      await runGit(directory, ['check-ref-format', explicitRemote ? branch : localRef])
      if (!explicitRemote) {
        const local = await this.readCommit(directory, localRef)
        if (local) return local
        if (branch.startsWith('refs/heads/')) throw new Error('Local branch unavailable')
      }
      const remotes = (await runGit(directory, ['remote'])).trim().split('\n').filter(Boolean)
      const remoteBranch = explicitRemote ? branch.slice('refs/remotes/'.length) : branch
      const namedRemote = remotes
        .sort((a, b) => b.length - a.length)
        .find((name) => remoteBranch.startsWith(`${name}/`))
      if (namedRemote) {
        const url = (await runGit(directory, ['remote', 'get-url', namedRemote])).trim()
        return await this.refresh(
          directory,
          repo,
          namedRemote,
          remoteBranch.slice(namedRemote.length + 1),
          url,
          true
        )
      }
      if (explicitRemote) throw new Error('Remote unavailable')
      for (const remote of remotes) {
        const url = (await runGit(directory, ['remote', 'get-url', remote])).trim()
        const match =
          /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(.+?)(?:\.git)?$/.exec(
            url
          )
        if (match?.[1].toLowerCase() === repo.toLowerCase()) {
          return await this.refresh(directory, repo, remote, branch, url, true)
        }
      }
      return await this.refresh(
        directory,
        repo,
        `https://github.com/${repo}.git`,
        branch,
        '',
        false
      )
    } catch {
      throw createExpectedAppError(
        'GITHUB_BASE_UNAVAILABLE',
        'Issue workspace base is unavailable.'
      )
    }
  }

  private async readCommit(directory: string, ref: string): Promise<string | undefined> {
    try {
      const commit = (await runGit(directory, ['rev-parse', '--verify', `${ref}^{commit}`])).trim()
      return /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(commit) ? commit : undefined
    } catch {
      return undefined
    }
  }

  private async refresh(
    directory: string,
    repo: string,
    source: string,
    branch: string,
    url: string,
    tracking: boolean
  ): Promise<string> {
    await runGit(directory, ['check-ref-format', `refs/heads/${branch}`])
    const key = JSON.stringify([directory, repo.toLowerCase(), source, branch, url])
    const cached = this.recent.get(key)
    if (
      cached &&
      cached.expiresAt > Date.now() &&
      (await this.readCommit(directory, cached.commit))
    )
      return cached.commit
    this.recent.delete(key)
    const existing = this.pending.get(key)
    if (existing) return existing
    if (this.pending.size >= cacheLimit) throw new Error('Too many pending bases')
    const request = this.fetchCommit(directory, source, branch, tracking)
      .then((commit) => {
        this.recent.set(key, { commit, expiresAt: Date.now() + freshnessMs })
        while (this.recent.size > cacheLimit) this.recent.delete(this.recent.keys().next().value!)
        return commit
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, request)
    return request
  }

  private async fetchCommit(
    directory: string,
    source: string,
    branch: string,
    tracking: boolean
  ): Promise<string> {
    if (tracking) {
      const ref = `refs/remotes/${source}/${branch}`
      await runGit(directory, [...fetchOptions, source, `+refs/heads/${branch}:${ref}`])
      const commit = await this.readCommit(directory, ref)
      if (!commit) throw new Error('Remote branch unavailable')
      return commit
    }
    const output = await runGit(directory, [
      'ls-remote',
      '--exit-code',
      '--heads',
      '--',
      source,
      `refs/heads/${branch}`
    ])
    const commit = output
      .trim()
      .split('\n')
      .find((line) => line.split('\t')[1] === `refs/heads/${branch}`)
      ?.split('\t')[0]
    if (!commit || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(commit))
      throw new Error('Remote branch unavailable')
    if (!(await this.readCommit(directory, commit)))
      await runGit(directory, [...fetchOptions, source, commit])
    if (!(await this.readCommit(directory, commit))) throw new Error('Fetched commit unavailable')
    return commit
  }
}
