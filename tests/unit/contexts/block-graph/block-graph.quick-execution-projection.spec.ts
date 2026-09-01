import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  listQuickExecutionCandidates,
  resolveQuickExecutionBinding,
  toQuickExecutionTarget
} from '../../../../src/contexts/block-graph/presentation/view-models/quickExecutionProjection'

describe('quick execution target projection', () => {
  it('lists each independent terminal, complete workflow, and combination once', () => {
    const graph = createGraph()

    expect(listQuickExecutionCandidates(graph)).toEqual([
      {
        key: 'workflow:api\u0000web',
        name: 'API → Web',
        target: { type: 'workflow', terminalBlockIds: ['api', 'web'] },
        type: 'workflow'
      },
      {
        key: 'terminal:worker',
        name: 'Worker',
        target: { type: 'terminal', terminalBlockId: 'worker' },
        type: 'terminal'
      },
      {
        key: 'combination:development',
        name: 'Development',
        target: { type: 'combination', terminalGroupId: 'development' },
        type: 'combination'
      }
    ])
  })

  it('marks a workflow binding unavailable when its connected membership changes', () => {
    const graph = createGraph()
    const target = { type: 'workflow' as const, terminalBlockIds: ['api', 'web'] }

    expect(resolveQuickExecutionBinding(graph, target)).toMatchObject({
      isAvailable: true,
      name: 'API → Web',
      type: 'workflow'
    })

    const changedGraph: BlockGraphSnapshot = {
      ...graph,
      connections: [
        ...(graph.connections ?? []),
        {
          id: 'web-before-worker',
          sourceBlockId: 'web',
          targetBlockId: 'worker'
        }
      ]
    }

    expect(resolveQuickExecutionBinding(changedGraph, target)).toMatchObject({
      isAvailable: false,
      type: 'workflow'
    })
  })

  it('converts all context menu targets to the same persisted target union', () => {
    expect(
      toQuickExecutionTarget({
        kind: 'combination',
        groupId: 'development',
        selectedConnectionIds: [],
        selectedNodeIds: ['development'],
        terminalBlockIds: ['api', 'web']
      })
    ).toEqual({ type: 'combination', terminalGroupId: 'development' })
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [
      createBlock('api', 'API', 'pnpm api'),
      createBlock('web', 'Web', 'pnpm web'),
      createBlock('worker', 'Worker', 'pnpm worker')
    ],
    connections: [
      {
        id: 'api-before-web',
        sourceBlockId: 'api',
        targetBlockId: 'web'
      }
    ],
    id: 'graph-1',
    projectId: 'project-1',
    quickExecutionSlots: [
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ],
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
