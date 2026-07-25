import { randomUUID } from 'node:crypto'

import { createExpectedAppError } from '../../../../../shared-kernel/application/errors/AppError'
import type {
  AgentFreshSessionStrategy,
  AgentProviderSessionRefCodec,
  AgentResumeStrategy
} from '../../../application/ports/AgentProviderContribution'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../../../domain/value-objects/ProviderSessionRef'

export interface DeclarativeTerminalCliSession {
  readonly freshSession: AgentFreshSessionStrategy
  readonly resume: AgentResumeStrategy
  readonly sessionRefCodec: AgentProviderSessionRefCodec
}

export function createClientAssignedTerminalCliSession(input: {
  readonly createArgs: (sessionId: string) => readonly string[]
  readonly createSessionId?: () => string
  readonly providerId: string
  readonly resumeArgs: (sessionId: string) => readonly string[]
  readonly sessionKind: string
  readonly validateSessionId: (sessionId: string) => boolean
}): DeclarativeTerminalCliSession {
  const codec: AgentProviderSessionRefCodec = {
    parse(sessionRef) {
      const parsed = ProviderSessionRef.create(sessionRef).toSnapshot()
      if (
        parsed.formatVersion !== 1 ||
        parsed.kind !== input.sessionKind ||
        !input.validateSessionId(parsed.value)
      ) {
        throw createExpectedAppError(
          'AGENT_SESSION_INVALID',
          `Unsupported ${input.providerId} Provider session reference.`,
          { providerId: input.providerId }
        )
      }
      return parsed
    }
  }
  const parse = (sessionRef: ProviderSessionRefSnapshot): ProviderSessionRefSnapshot =>
    codec.parse(sessionRef)

  return {
    freshSession: {
      createFreshSession() {
        const sessionRef = parse({
          formatVersion: 1,
          kind: input.sessionKind,
          value: (input.createSessionId ?? randomUUID)()
        })
        return {
          args: input.createArgs(sessionRef.value),
          sessionRef
        }
      }
    },
    resume: {
      createResumeArgs(sessionRef) {
        return input.resumeArgs(parse(sessionRef).value)
      }
    },
    sessionRefCodec: codec
  }
}
