const codexThreadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class CodexThreadId {
  private constructor(readonly value: string) {}

  static create(value: string): CodexThreadId {
    const normalizedValue = value.trim()

    if (!codexThreadIdPattern.test(normalizedValue)) {
      throw createExpectedAppError('AGENT_SESSION_INVALID', 'Codex thread id must be a UUID.', {
        fieldName: 'codexThreadId'
      })
    }

    return new CodexThreadId(normalizedValue)
  }
}
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
