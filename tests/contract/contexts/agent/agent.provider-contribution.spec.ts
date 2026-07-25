import type {
  AgentProviderContribution,
  AgentProviderDescriptor
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'

describe('Agent Provider contribution contract', () => {
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
