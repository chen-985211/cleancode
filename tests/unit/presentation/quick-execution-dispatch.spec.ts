import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { executeQuickExecutionTarget } from '../../../src/presentation/app-shell/executeQuickExecutionTarget'

describe('quick execution dispatch', () => {
  it('coordinates terminal, workflow, and combination execution entries', async () => {
    const graph = createGraph()
    const quickLaunchTerminal = vi.fn(async () => undefined)
    const startScope = vi.fn(async () => undefined)
    const startTerminalCombination = vi.fn(async () => undefined)

    await executeQuickExecutionTarget({
      graph,
      target: { type: 'terminal', terminalBlockId: 'worker' },
      quickLaunchTerminal,
      requestTerminalLaunchCommand: vi.fn(),
      startScope,
      startTerminalCombination
    })
    await executeQuickExecutionTarget({
      graph,
      target: { type: 'workflow', terminalBlockIds: ['api', 'web'] },
      quickLaunchTerminal,
      requestTerminalLaunchCommand: vi.fn(),
      startScope,
      startTerminalCombination
    })
    await executeQuickExecutionTarget({
      graph,
      target: { type: 'combination', terminalGroupId: 'development' },
      quickLaunchTerminal,
      requestTerminalLaunchCommand: vi.fn(),
      startScope,
      startTerminalCombination
    })

    expect(quickLaunchTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: 'worker' }))
    expect(startScope).toHaveBeenCalledWith({ type: 'block-set', blockIds: ['api', 'web'] })
    expect(startTerminalCombination).toHaveBeenCalledWith('development')
  })

  it('opens the launch-command editor instead of starting an unconfigured terminal', async () => {
    const baseGraph = createGraph()
    const graph: BlockGraphSnapshot = {
      ...baseGraph,
      blocks: baseGraph.blocks.map((block) =>
        block.id === 'worker' ? { ...block, launchCommand: '' } : block
      )
    }
    const quickLaunchTerminal = vi.fn()
    const requestTerminalLaunchCommand = vi.fn()

    await executeQuickExecutionTarget({
      graph,
      target: { type: 'terminal', terminalBlockId: 'worker' },
      quickLaunchTerminal,
      requestTerminalLaunchCommand,
      startScope: vi.fn(),
      startTerminalCombination: vi.fn()
    })

    expect(requestTerminalLaunchCommand).toHaveBeenCalledWith('worker')
    expect(quickLaunchTerminal).not.toHaveBeenCalled()
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [
      createBlock('api', 'API', 'pnpm api'),
      createBlock('web', 'Web', 'pnpm web'),
      createBlock('worker', 'Worker', 'pnpm worker')
    ],
    connections: [{ id: 'api-before-web', sourceBlockId: 'api', targetBlockId: 'web' }],
    id: 'graph-1',
    projectId: 'project-1',
    terminalGroups: [
      {
        id: 'development',
        isCollapsed: false,
        memberBlockIds: ['api', 'web', 'worker'],
        name: 'Development',
        position: { x: 0, y: 0 },
        size: { width: 1_200, height: 600 },
        type: 'terminal-group'
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}

function createBlock(id: string, name: string, launchCommand: string) {
  return {
    description: '',
    executionConfig: { mode: 'task' as const, successExitCodes: [0], timeoutMs: null },
    id,
    launchCommand,
    name,
    position: { x: 0, y: 0 },
    size: { width: 720, height: 460 },
    type: 'terminal' as const
  }
}
