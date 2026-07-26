import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { getAppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'

describe('terminal service port intent', () => {
  it.each([
    {
      binding: { type: 'none' },
      policy: { port: 4_173, type: 'fixed' },
      protocol: 'tcp'
    },
    {
      binding: { type: 'environment', variableName: 'PORT' },
      policy: { port: 5_173, type: 'preferred' },
      protocol: 'http'
    },
    {
      binding: { template: '-- --port={port}', type: 'argument' },
      policy: { type: 'auto' },
      protocol: 'https'
    }
  ] as const)('stores a canonical $policy.type port intent', (port) => {
    const graph = createGraph()

    graph.updateTerminalExecutionConfig('server', {
      mode: 'service',
      port,
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })

    expect(graph.toSnapshot().blocks[0]?.executionConfig).toEqual({
      mode: 'service',
      port,
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })
  })

  it.each([
    {
      binding: { type: 'none' },
      policy: { port: 5_173, type: 'preferred' },
      protocol: 'http'
    },
    {
      binding: { type: 'environment', variableName: '9PORT' },
      policy: { type: 'auto' },
      protocol: 'http'
    },
    {
      binding: { type: 'environment', variableName: 'CLEANCODE_INTERNAL_PORT' },
      policy: { type: 'auto' },
      protocol: 'http'
    },
    {
      binding: { template: '--port {port}; echo unsafe', type: 'argument' },
      policy: { type: 'auto' },
      protocol: 'http'
    },
    {
      binding: { template: '--port 4173', type: 'argument' },
      policy: { type: 'auto' },
      protocol: 'http'
    },
    {
      binding: { template: '--port {port} --fallback {port}', type: 'argument' },
      policy: { type: 'auto' },
      protocol: 'http'
    },
    {
      binding: { template: '--port {port}\necho unsafe', type: 'argument' },
      policy: { type: 'auto' },
      protocol: 'http'
    }
  ] as const)('rejects an invalid port policy and binding combination', (port) => {
    const graph = createGraph()

    expectErrorCode(
      () =>
        graph.updateTerminalExecutionConfig('server', {
          mode: 'service',
          port,
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        }),
      'TERMINAL_EXECUTION_CONFIG_INVALID'
    )
  })

  it('requires TCP readiness to reference a managed port intent', () => {
    const graph = createGraph()

    expectErrorCode(
      () =>
        graph.updateTerminalExecutionConfig('server', {
          mode: 'service',
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        }),
      'TERMINAL_EXECUTION_CONFIG_INVALID'
    )
  })

  it('keeps an output-ready service without guessing a port binding', () => {
    const graph = createGraph()

    graph.updateTerminalExecutionConfig('server', {
      mode: 'service',
      readiness: { text: 'ready', type: 'output' },
      readinessTimeoutMs: 30_000
    })

    expect(graph.toSnapshot().blocks[0]?.executionConfig).toEqual({
      mode: 'service',
      readiness: { text: 'ready', type: 'output' },
      readinessTimeoutMs: 30_000
    })
  })
})

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  graph.createTerminalBlock({
    id: 'server',
    description: 'Local server',
    name: 'Server',
    position: { x: 0, y: 0 }
  })
  return graph
}

function expectErrorCode(action: () => void, code: string): void {
  try {
    action()
    throw new Error(`Expected ${code}.`)
  } catch (error) {
    expect(getAppErrorCode(error)).toBe(code)
  }
}
