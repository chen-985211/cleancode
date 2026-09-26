import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitHubIssuePort } from '../../application/ports/GitHubIssuePort'
import type {
  ListProjectIssuesQuery,
  ProjectIssueSnapshot
} from '../../application/dto/ProjectIssues'
import {
  normalizeIssueRepository,
  normalizeProjectIssue
} from '../../domain/value-objects/ProjectIssue'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

const execute = promisify(execFile)
const fields = 'id,number,title,state,labels,assignees'

export class GitHubCliIssueAdapter implements GitHubIssuePort {
  constructor(
    private readonly executable = 'gh',
    private readonly prefixArgs: readonly string[] = []
  ) {}

  async repository(directory: string, repository?: string) {
    const value = await this.query(directory, [
      'repo',
      'view',
      ...(repository ? [normalizeIssueRepository(repository)] : []),
      '--json',
      'nameWithOwner,defaultBranchRef'
    ])
    if (
      !record(value) ||
      typeof value.nameWithOwner !== 'string' ||
      !record(value.defaultBranchRef) ||
      typeof value.defaultBranchRef.name !== 'string'
    )
      failed()
    return {
      name: normalizeIssueRepository(value.nameWithOwner),
      defaultBranch: value.defaultBranchRef.name
    }
  }

  async list(directory: string, repository: string, query: ListProjectIssuesQuery) {
    const repo = normalizeIssueRepository(repository)
    const value = await this.query(directory, [
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--json',
      fields,
      '--limit',
      String(query.limit ?? 51),
      ...(query.search ? ['--search', query.search] : []),
      ...(query.assignedToMe ? ['--assignee', '@me'] : []),
      ...(query.label ? ['--label', query.label] : [])
    ])
    if (!Array.isArray(value)) failed()
    return value.map((item) => parseIssue(item, repo))
  }

  async issue(directory: string, repository: string, number: number) {
    if (!Number.isSafeInteger(number) || number < 1) failed()
    const repo = normalizeIssueRepository(repository)
    return parseIssue(
      await this.query(directory, [
        'issue',
        'view',
        String(number),
        '--repo',
        repo,
        '--json',
        `${fields},body`
      ]),
      repo
    )
  }

  private async query(directory: string, args: readonly string[]): Promise<unknown> {
    const env = {
      ...process.env,
      GH_HOST: 'github.com',
      GH_PROMPT_DISABLED: '1',
      GH_PAGER: 'cat',
      GH_BROWSER: '',
      GH_REPO: ''
    }
    try {
      let stdout: string
      try {
        stdout = (
          await execute(this.executable, [...this.prefixArgs, ...args], {
            cwd: directory,
            env,
            timeout: 30000,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true
          })
        ).stdout
      } catch (error) {
        if (this.executable !== 'gh' || process.platform !== 'darwin' || !isCode(error, 'ENOENT'))
          throw error
        // Finder-launched apps may not inherit Homebrew's bin directory.
        const executable = process.arch === 'arm64' ? '/opt/homebrew/bin/gh' : '/usr/local/bin/gh'
        stdout = (
          await execute(executable, args, {
            cwd: directory,
            env,
            timeout: 30000,
            maxBuffer: 4 * 1024 * 1024
          })
        ).stdout
      }
      return JSON.parse(stdout)
    } catch (error) {
      if (isCode(error, 'ENOENT'))
        throw createExpectedAppError('GITHUB_CLI_UNAVAILABLE', 'GitHub CLI is unavailable.')
      if (isCode(error, 4))
        throw createExpectedAppError('GITHUB_AUTH_REQUIRED', 'GitHub authentication is required.')
      const stderr =
        record(error) && typeof error.stderr === 'string' ? error.stderr.toLowerCase() : ''
      if (stderr.includes('has disabled issues'))
        throw createExpectedAppError('GITHUB_ISSUES_DISABLED', 'GitHub Issues are disabled.')
      if (stderr.includes('rate limit'))
        throw createExpectedAppError('GITHUB_RATE_LIMITED', 'GitHub request limit was reached.')
      if (stderr.includes('http 401') || stderr.includes('bad credentials'))
        throw createExpectedAppError('GITHUB_AUTH_REQUIRED', 'GitHub authentication is required.')
      if (stderr.includes('http 403') || stderr.includes('resource not accessible'))
        throw createExpectedAppError(
          'GITHUB_PERMISSION_DENIED',
          'GitHub read permission is required.'
        )
      if (stderr.includes('http 404') || stderr.includes('could not resolve to a repository'))
        throw createExpectedAppError(
          'GITHUB_RESOURCE_UNAVAILABLE',
          'GitHub resource is unavailable.'
        )
      failed()
    }
  }
}

function parseIssue(value: unknown, repository: string): ProjectIssueSnapshot {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    typeof value.number !== 'number' ||
    !Number.isSafeInteger(value.number) ||
    value.number < 1 ||
    typeof value.title !== 'string' ||
    !['OPEN', 'CLOSED'].includes(String(value.state)) ||
    !Array.isArray(value.labels) ||
    !Array.isArray(value.assignees) ||
    (value.body !== undefined && typeof value.body !== 'string')
  )
    failed()
  return {
    ...normalizeProjectIssue({
      id: value.id,
      repository,
      number: value.number,
      title: value.title,
      url: ''
    }),
    body: (value.body as string | undefined) ?? '',
    state: value.state as 'OPEN' | 'CLOSED',
    labels: value.labels.map((item) => {
      if (!record(item) || typeof item.name !== 'string') failed()
      return item.name
    }),
    assignees: value.assignees.map((item) => {
      if (!record(item) || typeof item.login !== 'string') failed()
      return item.login
    })
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}
function isCode(error: unknown, code: string | number): boolean {
  return record(error) && error.code === code
}
function failed(): never {
  throw createExpectedAppError('GITHUB_REQUEST_FAILED', 'GitHub request failed.')
}
