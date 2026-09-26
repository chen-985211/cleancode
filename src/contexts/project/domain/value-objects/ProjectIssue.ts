import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface ProjectIssueReference {
  readonly id: string
  readonly repository: string
  readonly number: number
  readonly title: string
  readonly url: string
}

export function normalizeIssueRepository(value: string): string {
  const repository = value.trim()
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(repository) ||
    /\/\.{1,2}$/.test(repository)
  ) {
    throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Invalid GitHub repository.')
  }
  return repository
}

export function normalizeProjectIssue(value: ProjectIssueReference): ProjectIssueReference {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.repository !== 'string' ||
    !Number.isSafeInteger(value.number) ||
    value.number < 1 ||
    typeof value.title !== 'string'
  ) {
    throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Invalid GitHub issue.')
  }
  const repository = normalizeIssueRepository(value.repository)
  return {
    id: value.id,
    repository,
    number: value.number,
    title: value.title,
    url: `https://github.com/${repository}/issues/${value.number}`
  }
}

export function sameProjectIssue(
  a: ProjectIssueReference | undefined,
  b: ProjectIssueReference | undefined
): boolean {
  return Boolean(a && b && a.id === b.id)
}
