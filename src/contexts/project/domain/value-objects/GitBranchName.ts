import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

// Literal branch names only: checkout expressions such as @{-1} must not be frozen
// into a workspace initialization request.
export function isValidNewBranchName(value: string | null): boolean {
  return (
    value !== null &&
    value.length > 0 &&
    value !== 'HEAD' &&
    !value.startsWith('-') &&
    !value.endsWith('.') &&
    !value.includes('..') &&
    !value.includes('@{') &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 32 || code === 127 || '~^:?*[\\'.includes(character)
    }) &&
    value.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock'))
  )
}

export function normalizeNewBranchName(value: string): string {
  const branchName = value.trim()
  if (!isValidNewBranchName(branchName)) {
    throw createExpectedAppError('GIT_BRANCH_NAME_INVALID', 'Invalid Git branch name.')
  }
  return branchName
}
