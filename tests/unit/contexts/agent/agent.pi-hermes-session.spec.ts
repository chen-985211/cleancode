import type { AgentProviderContribution } from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import { PiAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/pi/PiAgentProviderContribution'
import { HermesAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/hermes/HermesAgentProviderContribution'

const cases = [
  {
    create: () => new PiAgentProviderContribution(),
    id: 'pi',
    kind: 'pi-session',
    value: '/sessions/conversation.jsonl',
    args: ['--session', '/sessions/conversation.jsonl']
  },
  {
    create: () => new HermesAgentProviderContribution(),
    id: 'hermes',
    kind: 'hermes-session',
    value: '20260908_123456_a1b2c3',
    args: ['--resume', '20260908_123456_a1b2c3', '--no-restore-cwd']
  }
]

describe('Pi and Hermes exact session recovery', () => {
  it.each(cases)(
    'registers $id with identity capture and exact recovery',
    ({ create, kind, value, args }) => {
      const provider: AgentProviderContribution = create()
      expect(() => new AgentProviderRegistry([provider])).not.toThrow()
      expect(provider.descriptor.capabilities).toMatchObject({
        resume: true,
        sessionRefCodec: true,
        sessionIdentityCapture: true,
        activityTracking: true,
        cleancodeMcp: false
      })
      expect(provider.resume?.createResumeArgs({ formatVersion: 1, kind, value })).toEqual(args)
    }
  )

  it.each(cases)(
    'rejects foreign, malformed, and future $id references',
    ({ create, kind, value }) => {
      const provider: AgentProviderContribution = create()
      for (const ref of [
        { formatVersion: 1, kind: 'foreign-session', value },
        { formatVersion: 2, kind, value },
        { formatVersion: 1, kind, value: 'latest' },
        { formatVersion: 1, kind, value: '../other-session' }
      ]) {
        expect(() => provider.resume?.createResumeArgs(ref)).toThrow()
      }
    }
  )
})
