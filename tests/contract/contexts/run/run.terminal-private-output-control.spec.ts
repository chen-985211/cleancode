import type { StartTerminalProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  encodeTerminalProviderFrame,
  TerminalProviderFrameDecoder,
  terminalProviderProtocolVersion,
  type TerminalProviderRequest
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'

describe('terminal private output control contract', () => {
  it('keeps private launch environment isolated across the provider protocol frame', () => {
    const command = {
      scope: {
        blockId: 'block-1',
        generation: 1,
        gitBranch: 'main',
        projectDirectory: '/work/app',
        projectId: 'project-1',
        runId: 'run-1',
        sessionId: 'session-1',
        workspaceDirectory: '/work/app',
        workspaceId: 'main'
      },
      workingDirectory: '/work/app',
      environment: { PUBLIC_ENVIRONMENT: 'visible' },
      privateOutputControl: {
        protocol: 'osc-633-span-v1',
        token: 'private-output-token',
        environment: { CLEANCODE_PRIVATE_OUTPUT_TOKEN: 'private-output-token' }
      },
      columns: 80,
      rows: 24
    } satisfies Omit<StartTerminalProcessCommand, 'onExit' | 'onOutput'>
    const request = {
      type: 'request',
      protocolVersion: terminalProviderProtocolVersion,
      requestId: 'request-1',
      authToken: 'provider-auth-token',
      method: 'startProcess',
      params: { command }
    } satisfies TerminalProviderRequest

    expect(new TerminalProviderFrameDecoder().push(encodeTerminalProviderFrame(request))).toEqual([
      expect.objectContaining({
        params: {
          command: expect.objectContaining({
            environment: { PUBLIC_ENVIRONMENT: 'visible' },
            privateOutputControl: {
              protocol: 'osc-633-span-v1',
              token: 'private-output-token',
              environment: { CLEANCODE_PRIVATE_OUTPUT_TOKEN: 'private-output-token' }
            }
          })
        }
      })
    ])
  })
})
