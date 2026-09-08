import type {
  AgentProviderContribution,
  AgentProviderDescriptor
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import { PiAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/pi/PiAgentProviderContribution'
import { HermesAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/hermes/HermesAgentProviderContribution'

describe('Agent Provider contribution contract', () => {
  it.each([new PiAgentProviderContribution(), new HermesAgentProviderContribution()])(
    'requires activity telemetry to agree with the $descriptor.id capability',
    (provider) => {
      expect(provider.telemetry?.signals).toEqual({ activity: true, sessionIdentity: true })
      expect(new AgentProviderRegistry([provider]).require(provider.descriptor.id)).toBe(provider)
      expect(
        () =>
          new AgentProviderRegistry([
            {
              ...provider,
              telemetry: {
                ...provider.telemetry!,
                prepare: provider.telemetry!.prepare.bind(provider.telemetry),
                signals: { activity: false, sessionIdentity: true }
              }
            }
          ])
      ).toThrow()
    }
  )
  it('allows identity-only telemetry to report a new empty conversation without activity', async () => {
    const events: string[] = []
    const contribution: AgentProviderContribution = {
      descriptor: createDescriptor(),
      detector: {
        inspect: async () => ({ providerId: 'example', status: 'installed', version: '1.0.0' })
      },
      sessionRefCodec: { parse: (ref) => ref },
      resume: { createResumeArgs: (ref) => ['--resume', ref.value] },
      telemetry: {
        signals: { activity: false, sessionIdentity: true },
        prepare: async (command) => {
          command.onProviderSessionCleared?.()
          command.onProviderSessionIdentified({
            formatVersion: 1,
            kind: 'example-session',
            value: 'durable-session'
          })
          return { args: [], env: {} }
        }
      },
      launcher: {
        createLaunchPlan: async (command) => ({
          executable: 'example',
          ...(await contribution.telemetry!.prepare(command))
        })
      }
    }
    const registry = new AgentProviderRegistry([contribution])
    await registry.require('example').launcher.createLaunchPlan({
      artifacts: { track: (_label, artifact) => artifact },
      onProviderSessionCleared: () => events.push('empty'),
      onProviderSessionIdentified: (ref) => events.push(ref.value),
      workspaceDirectory: '/repo'
    })
    expect(events).toEqual(['empty', 'durable-session'])
  })

  it('accepts a client-assigned session identity without requiring telemetry', async () => {
    const sessionRef = {
      formatVersion: 1,
      kind: 'example-session',
      value: 'session-1'
    } as const
    const contribution: AgentProviderContribution = {
      descriptor: createDescriptor(),
      detector: {
        inspect: async () => ({
          providerId: 'example',
          status: 'installed',
          version: '1.0.0'
        })
      },
      freshSession: {
        createFreshSession: () => ({
          args: ['--session-id', sessionRef.value],
          sessionRef
        })
      },
      launcher: {
        createLaunchPlan: async () => ({
          args: ['--session-id', sessionRef.value],
          env: {},
          executable: 'example',
          providerSessionRefOnStarted: sessionRef
        })
      },
      resume: {
        createResumeArgs: (ref) => ['--resume', ref.value]
      },
      sessionRefCodec: {
        parse: (ref) => ref
      }
    }

    const registry = new AgentProviderRegistry([contribution])
    const plan = await registry.require('example').launcher.createLaunchPlan({
      artifacts: { track: (_label, artifact) => artifact },
      onProviderSessionIdentified: vi.fn(),
      workspaceDirectory: '/repo/worktree'
    })

    expect(plan.providerSessionRefOnStarted).toEqual(sessionRef)
    expect(contribution.telemetry).toBeUndefined()
    expect(registry.parseSessionRef('example', sessionRef).toSnapshot()).toEqual(sessionRef)
  })
})

function createDescriptor(): AgentProviderDescriptor {
  return {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: false,
      launchInstructions: false,
      resume: true,
      sessionIdentityCapture: true,
      sessionRefCodec: true
    },
    displayName: 'Example',
    icon: {
      paths: [{ d: 'M0 0h16v16H0z' }],
      viewBox: '0 0 16 16'
    },
    id: 'example'
  }
}
