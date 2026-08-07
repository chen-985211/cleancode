import {
  parseAgentToolInput,
  type AgentToolInputByName
} from '../../../../src/contexts/agent/application/dto/AgentToolInputValidation'
import type { AgentToolName } from '../../../../src/contexts/agent/domain/value-objects/AgentToolName'

describe('agent tool input validation', () => {
  it('accepts inputs described by every CleanCode tool schema', () => {
    const validInputs: { readonly [Name in AgentToolName]: AgentToolInputByName[Name] } = {
      arrange_terminal_layout: {
        blockIds: ['terminal-build', 'terminal-test']
      },
      connect_terminal_blocks: {
        sourceBlockId: 'terminal-build',
        targetBlockId: 'terminal-test'
      },
      create_block: {
        name: 'Build',
        type: 'terminal'
      },
      create_terminal_workflow: {
        connections: [{ sourceRef: 'api', targetRef: 'web' }],
        terminalGroup: {
          memberRefs: ['api', 'web', 'worker'],
          name: 'Development'
        },
        terminals: [
          {
            executionConfig: {
              mode: 'service',
              port: {
                binding: { type: 'environment', variableName: 'PORT' },
                policy: { port: 4100, type: 'preferred' },
                protocol: 'http'
              },
              readiness: { type: 'tcp' },
              readinessTimeoutMs: 30_000
            },
            launchCommand: 'pnpm api',
            name: 'API',
            ref: 'api'
          },
          {
            launchCommand: 'pnpm web',
            name: 'Web',
            ref: 'web'
          },
          {
            launchCommand: 'pnpm worker',
            name: 'Worker',
            ref: 'worker'
          }
        ]
      },
      create_terminal_group: {
        memberBlockIds: ['terminal-build', 'terminal-test'],
        name: 'Checks'
      },
      delete_block: { blockId: 'terminal-build' },
      delete_terminal_group: { terminalGroupId: 'group-checks' },
      disconnect_terminal_blocks: { connectionId: 'connection-build-test' },
      inspect_graph: { reason: 'Inspect before authoring a workflow.' },
      inspect_terminal_workflow_plan: { scope: { type: 'full' } },
      move_terminal_workflow_to_group: {
        blockId: 'terminal-build',
        targetTerminalGroupId: 'group-checks'
      },
      update_block: {
        blockId: 'terminal-build',
        launchCommand: 'pnpm build',
        size: { height: 360, width: 560 }
      },
      update_terminal_execution_config: {
        blockId: 'terminal-build',
        executionConfig: {
          mode: 'task',
          successExitCodes: [0, 2],
          timeoutMs: 60_000
        }
      },
      update_terminal_group: {
        isCollapsed: true,
        terminalGroupId: 'group-checks'
      }
    }

    for (const toolName of Object.keys(validInputs) as AgentToolName[]) {
      expect(parseAgentToolInput(toolName, validInputs[toolName])).toEqual(validInputs[toolName])
    }

    expect(
      parseAgentToolInput('create_block', {
        name: 'Explicit Build',
        position: { x: 120, y: 80 },
        type: 'terminal'
      })
    ).toMatchObject({ position: { x: 120, y: 80 } })
    expect(
      parseAgentToolInput('update_terminal_execution_config', {
        blockId: 'terminal-api',
        executionConfig: {
          mode: 'service',
          port: {
            binding: { type: 'environment', variableName: 'PORT' },
            policy: { port: 4_173, type: 'preferred' },
            protocol: 'http'
          },
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        }
      })
    ).toMatchObject({ executionConfig: { mode: 'service' } })
    expect(
      parseAgentToolInput('inspect_terminal_workflow_plan', {
        scope: { blockId: 'terminal-build', type: 'from-block' }
      })
    ).toEqual({ scope: { blockId: 'terminal-build', type: 'from-block' } })
    expect(
      parseAgentToolInput('move_terminal_workflow_to_group', {
        blockId: 'terminal-build',
        position: { x: 1_200, y: 480 },
        targetTerminalGroupId: null
      })
    ).toEqual({
      blockId: 'terminal-build',
      position: { x: 1_200, y: 480 },
      targetTerminalGroupId: null
    })
    expect(
      parseAgentToolInput('update_terminal_execution_config', {
        blockId: 'terminal-fixed',
        executionConfig: {
          mode: 'service',
          port: {
            binding: { type: 'none' },
            policy: { port: 4_173, type: 'fixed' },
            protocol: 'tcp'
          },
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        }
      })
    ).toMatchObject({ executionConfig: { port: { policy: { type: 'fixed' } } } })
  })

  it.each([
    {
      binding: { type: 'environment', variableName: 'PORT' },
      policy: { port: 4_173, type: 'preferred' }
    },
    {
      binding: { template: '--port {port}', type: 'argument' },
      policy: { port: 4_173, type: 'preferred' }
    },
    {
      binding: { type: 'environment', variableName: 'PORT' },
      policy: { type: 'auto' }
    },
    {
      binding: { template: '--port {port}', type: 'argument' },
      policy: { type: 'auto' }
    }
  ] as const)(
    'round-trips a managed dynamic port using $policy.type with $binding.type injection',
    ({ binding, policy }) => {
      const input = {
        blockId: 'terminal-api',
        executionConfig: {
          mode: 'service',
          port: { binding, policy, protocol: 'http' },
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        }
      } as const

      expect(parseAgentToolInput('update_terminal_execution_config', input)).toEqual(input)
    }
  )

  it('keeps an output-readiness service without a managed port backward compatible', () => {
    const input = {
      blockId: 'terminal-worker',
      executionConfig: {
        mode: 'service',
        readiness: { text: 'worker ready', type: 'output' },
        readinessTimeoutMs: 30_000
      }
    } as const

    expect(parseAgentToolInput('update_terminal_execution_config', input)).toEqual(input)
  })

  it('rejects undeclared properties at the top level and in nested objects', () => {
    expectInvalidInput(
      () =>
        parseAgentToolInput('connect_terminal_blocks', {
          projectDirectory: '/tmp/escape',
          sourceBlockId: 'terminal-build',
          targetBlockId: 'terminal-test'
        }),
      '$.projectDirectory'
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('update_terminal_execution_config', {
          blockId: 'terminal-api',
          executionConfig: {
            mode: 'service',
            port: {
              binding: { type: 'none' },
              policy: { port: 4_173, type: 'fixed' },
              protocol: 'tcp'
            },
            readiness: { host: 'example.com', type: 'tcp' },
            readinessTimeoutMs: 30_000
          }
        }),
      '$.executionConfig.readiness.host'
    )
  })

  it('rejects missing fields, invalid discriminators, duplicates, and out-of-range values', () => {
    expectInvalidInput(
      () => parseAgentToolInput('arrange_terminal_layout', { blockIds: [] }),
      '$.blockIds'
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('create_terminal_workflow', {
          connections: [],
          terminals: []
        }),
      '$.terminals'
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('arrange_terminal_layout', {
          blockIds: ['terminal-build', 'terminal-build']
        }),
      '$.blockIds'
    )
    expectInvalidInput(
      () => parseAgentToolInput('disconnect_terminal_blocks', {}),
      '$.connectionId'
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('move_terminal_workflow_to_group', {
          blockId: 'terminal-build',
          targetTerminalGroupId: null
        }),
      '$.targetTerminalGroupId'
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('inspect_terminal_workflow_plan', {
          scope: { type: 'from-block' }
        }),
      '$.scope.blockId'
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('update_terminal_execution_config', {
          blockId: 'terminal-build',
          executionConfig: {
            mode: 'task',
            successExitCodes: [0, 0],
            timeoutMs: null
          }
        }),
      '$.executionConfig.successExitCodes'
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('update_terminal_execution_config', {
          blockId: 'terminal-api',
          executionConfig: {
            mode: 'service',
            port: {
              binding: { type: 'none' },
              policy: { port: 65_536, type: 'fixed' },
              protocol: 'tcp'
            },
            readiness: { type: 'tcp' },
            readinessTimeoutMs: 30_000
          }
        }),
      expect.stringContaining('$.executionConfig.port')
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('update_terminal_execution_config', {
          blockId: 'terminal-legacy',
          executionConfig: {
            mode: 'service',
            readiness: { port: 4_173, type: 'tcp' },
            readinessTimeoutMs: 30_000
          }
        }),
      expect.stringContaining('$.executionConfig')
    )
    expectInvalidInput(
      () =>
        parseAgentToolInput('update_terminal_execution_config', {
          blockId: 'terminal-unbound',
          executionConfig: {
            mode: 'service',
            readiness: { type: 'tcp' },
            readinessTimeoutMs: 30_000
          }
        }),
      expect.stringContaining('$.executionConfig')
    )
  })

  it.each([
    {
      binding: { type: 'none' },
      policy: { type: 'auto' },
      protocol: 'http'
    },
    {
      binding: { type: 'environment', variableName: '9PORT' },
      policy: { type: 'auto' },
      protocol: 'http'
    },
    {
      binding: { template: '--port {port}; echo unsafe', type: 'argument' },
      policy: { type: 'auto' },
      protocol: 'http'
    }
  ] as const)('rejects an unsafe or incompatible Agent port intent', (port) => {
    expectInvalidInput(
      () =>
        parseAgentToolInput('update_terminal_execution_config', {
          blockId: 'terminal-api',
          executionConfig: {
            mode: 'service',
            port,
            readiness: { type: 'tcp' },
            readinessTimeoutMs: 30_000
          }
        }),
      expect.stringContaining('$.executionConfig.port')
    )
  })

  it('rejects non-JSON numeric values before they reach graph use cases', () => {
    expectInvalidInput(
      () =>
        parseAgentToolInput('create_block', {
          name: 'Build',
          position: { x: Number.NaN, y: 80 },
          type: 'terminal'
        }),
      '$.position.x'
    )
  })
})

function expectInvalidInput(action: () => unknown, expectedPath: unknown): void {
  try {
    action()
  } catch (error) {
    expect(error).toMatchObject({
      code: 'AGENT_TOOL_INPUT_INVALID',
      details: {
        path: expectedPath,
        reason: expect.any(String)
      },
      isExpected: true,
      message: 'Agent tool input is invalid.'
    })
    return
  }

  throw new Error('Expected Agent tool input validation to fail.')
}
