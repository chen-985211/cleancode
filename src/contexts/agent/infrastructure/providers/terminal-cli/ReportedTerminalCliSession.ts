import { isAbsolute, win32 } from 'node:path'

import { createExpectedAppError } from '../../../../../shared-kernel/application/errors/AppError'
import type {
  AgentProviderSessionRefCodec,
  AgentResumeStrategy
} from '../../../application/ports/AgentProviderContribution'
import { ProviderSessionRef } from '../../../domain/value-objects/ProviderSessionRef'

export function createReportedTerminalCliSession(providerId: 'pi' | 'hermes'): {
  readonly sessionRefCodec: AgentProviderSessionRefCodec
  readonly resume: AgentResumeStrategy
} {
  const sessionRefCodec: AgentProviderSessionRefCodec = {
    parse(input) {
      const ref = ProviderSessionRef.create(input).toSnapshot()
      const validValue =
        providerId === 'pi'
          ? (isAbsolute(ref.value) || win32.isAbsolute(ref.value)) &&
            ref.value.endsWith('.jsonl') &&
            !/[\r\n\0]/.test(ref.value)
          : /^\d{8}_\d{6}_[a-f0-9]{6,8}$/.test(ref.value)
      if (ref.formatVersion !== 1 || ref.kind !== `${providerId}-session` || !validValue) {
        throw createExpectedAppError(
          'AGENT_SESSION_INVALID',
          `Unsupported ${providerId} session reference.`,
          { providerId }
        )
      }
      return ref
    }
  }
  return {
    sessionRefCodec,
    resume: {
      createResumeArgs: (ref) =>
        providerId === 'pi'
          ? ['--session', sessionRefCodec.parse(ref).value]
          : ['--resume', sessionRefCodec.parse(ref).value, '--no-restore-cwd']
    }
  }
}
