import { getAppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal workflow configuration in a block graph', () => {
  it('restores legacy graphs with task defaults and no terminal connections', () => {
    const graph = BlockGraph.fromSnapshot({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceName: 'main',
      blocks: [
        {
          id: 'install',
          type: 'terminal',
          name: 'Install',
          description: 'Install dependencies.',
          launchCommand: 'pnpm install',
          position: { x: 100, y: 100 }
        }
      ]
    })

    expect(graph.toSnapshot()).toMatchObject({
      connections: [],
      blocks: [
        {
          id: 'install',
          executionConfig: {
            mode: 'task',
            successExitCodes: [0],
            timeoutMs: null
          }
        }
      ]
    })
  })

  it('connects terminals persistently and removes incident connections with a deleted block', () => {
    const graph = createWorkflowGraph()

    const installToBuild = graph.connectTerminalBlocks({
      id: 'install-to-build',
      sourceBlockId: 'install',
      targetBlockId: 'build'
    })
    graph.connectTerminalBlocks({
      id: 'build-to-test',
      sourceBlockId: 'build',
      targetBlockId: 'test'
    })

    expect(graph.toSnapshot().connections).toEqual([
      installToBuild,
      {
        id: 'build-to-test',
        sourceBlockId: 'build',
        targetBlockId: 'test'
      }
    ])

    graph.deleteBlock('build')

    expect(graph.toSnapshot().connections).toEqual([])
  })

  it('rejects self links, duplicate links, dangling links, and cycles', () => {
    const graph = createWorkflowGraph()
    graph.connectTerminalBlocks({
      sourceBlockId: 'install',
      targetBlockId: 'build'
    })
    graph.connectTerminalBlocks({
      sourceBlockId: 'build',
      targetBlockId: 'test'
    })

    expectErrorCode(
      () =>
        graph.connectTerminalBlocks({
          sourceBlockId: 'install',
          targetBlockId: 'install'
        }),
      'TERMINAL_CONNECTION_INVALID'
    )
    expectErrorCode(
      () =>
        graph.connectTerminalBlocks({
          sourceBlockId: 'install',
          targetBlockId: 'build'
        }),
      'TERMINAL_CONNECTION_DUPLICATE'
    )
    expectErrorCode(
      () =>
        graph.connectTerminalBlocks({
          sourceBlockId: 'missing',
          targetBlockId: 'test'
        }),
      'TERMINAL_BLOCK_NOT_FOUND'
    )
    expectErrorCode(
      () =>
        graph.connectTerminalBlocks({
          sourceBlockId: 'test',
          targetBlockId: 'install'
        }),
      'TERMINAL_WORKFLOW_CYCLE'
    )
  })

  it('disconnects a terminal connection by identity', () => {
    const graph = createWorkflowGraph()
    graph.connectTerminalBlocks({
      id: 'install-to-build',
      sourceBlockId: 'install',
      targetBlockId: 'build'
    })

    graph.disconnectTerminalBlocks('install-to-build')

    expect(graph.toSnapshot().connections).toEqual([])
  })

  it('stores task success codes and optional task timeouts', () => {
    const graph = createWorkflowGraph()

    graph.updateTerminalExecutionConfig('install', {
      mode: 'task',
      successExitCodes: [0, 2],
      timeoutMs: 120_000
    })

    expect(graph.toSnapshot().blocks[0]?.executionConfig).toEqual({
      mode: 'task',
      successExitCodes: [0, 2],
      timeoutMs: 120_000
    })
  })

  it('stores literal-output and TCP service readiness configuration', () => {
    const graph = createWorkflowGraph()

    graph.updateTerminalExecutionConfig('build', {
      mode: 'service',
      readiness: { type: 'output', text: ' server ready ' },
      readinessTimeoutMs: 30_000
    })
    graph.updateTerminalExecutionConfig('test', {
      mode: 'service',
      readiness: { type: 'tcp', port: 4173 },
      readinessTimeoutMs: 45_000
    })

    expect(
      graph
        .toSnapshot()
        .blocks.slice(1)
        .map((block) => block.executionConfig)
    ).toEqual([
      {
        mode: 'service',
        readiness: { type: 'output', text: 'server ready' },
        readinessTimeoutMs: 30_000
      },
      {
        mode: 'service',
        readiness: { type: 'tcp', port: 4173 },
        readinessTimeoutMs: 45_000
      }
    ])
  })

  it('rejects invalid task and service configuration', () => {
    const graph = createWorkflowGraph()

    const invalidConfigs = [
      { mode: 'task', successExitCodes: [], timeoutMs: null },
      { mode: 'task', successExitCodes: [0, 1.5], timeoutMs: null },
      { mode: 'task', successExitCodes: [0], timeoutMs: 0 },
      {
        mode: 'service',
        readiness: { type: 'output', text: '   ' },
        readinessTimeoutMs: 30_000
      },
      {
        mode: 'service',
        readiness: { type: 'tcp', port: 70_000 },
        readinessTimeoutMs: 30_000
      }
    ] as const

    for (const config of invalidConfigs) {
      expectErrorCode(
        () => graph.updateTerminalExecutionConfig('install', config),
        'TERMINAL_EXECUTION_CONFIG_INVALID'
      )
    }
  })
})

function createWorkflowGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({
    projectId: 'project-1',
    workspaceName: 'main'
  })

  for (const [id, name] of [
    ['install', 'Install'],
    ['build', 'Build'],
    ['test', 'Test']
  ] as const) {
    graph.createTerminalBlock({
      id,
      name,
      description: `${name} dependencies.`,
      position: { x: 100, y: 100 }
    })
  }

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
