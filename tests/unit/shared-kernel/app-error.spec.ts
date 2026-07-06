import {
  createClientAppError,
  createExpectedAppError,
  getAppErrorCode,
  isAppError,
  serializeAppError
} from '../../../src/shared-kernel/application/errors/AppError'

describe('application errors', () => {
  it('serializes expected errors with a stable code', () => {
    const error = createExpectedAppError(
      'GIT_BRANCH_ALREADY_EXISTS',
      'Git branch already exists.',
      { branchName: 'main' }
    )

    expect(isAppError(error)).toBe(true)
    expect(serializeAppError(error, { correlationId: 'operation-1' })).toEqual({
      code: 'GIT_BRANCH_ALREADY_EXISTS',
      correlationId: 'operation-1',
      details: { branchName: 'main' },
      isExpected: true,
      message: 'Git branch already exists.'
    })
  })

  it('restores serialized errors on the renderer side', () => {
    const error = createClientAppError({
      code: 'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
      correlationId: 'operation-2',
      isExpected: true,
      message: 'Branch workspace has uncommitted changes.'
    })

    expect(error).toBeInstanceOf(Error)
    expect(getAppErrorCode(error)).toBe('BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES')
    expect(error.correlationId).toBe('operation-2')
  })

  it('falls back to no code for ordinary errors', () => {
    expect(getAppErrorCode(new Error('plain failure'))).toBeNull()
  })
})
