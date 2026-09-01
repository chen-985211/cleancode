import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createIdleTerminalState } from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import type {
  TerminalFlowNode,
  TerminalGroupFlowNode
} from '../../../src/presentation/app-shell/types'
import { resolveTerminalGroupDropAction } from '../../../src/contexts/block-graph/presentation/view-models/terminalGroupDropTarget'
import { projectTerminalGroupDropAction } from '../../../src/presentation/app-shell/terminalGroupDropProjection'

describe('terminal group drop target', () => {
  it('joins an ungrouped terminal when its center is dropped inside a group', () => {
    const action = resolveTerminalGroupDropAction({
      graph: createGraph(),
      draggedNode: createTerminalNode({
        id: 'worker-terminal',
        position: { x: 420, y: 260 }
      }),
      nodes: [
        createGroupNode({
          id: 'development-group',
          position: { x: 300, y: 180 },
          size: { width: 760, height: 380 },
          memberBlockIds: ['backend-terminal', 'frontend-terminal']
        })
      ]
    })

    expect(action).toEqual({
      type: 'join-group',
      terminalGroupId: 'development-group'
    })
  })

  it('leaves a group when a member terminal is dropped outside its group bounds', () => {
    const action = resolveTerminalGroupDropAction({
      graph: createGraph({
        memberBlockIds: ['backend-terminal', 'frontend-terminal', 'worker-terminal']
      }),
      draggedNode: createTerminalNode({
        id: 'backend-terminal',
        position: { x: 1180, y: 260 }
      }),
      nodes: [
        createGroupNode({
          id: 'development-group',
          position: { x: 300, y: 180 },
          size: { width: 760, height: 380 },
          memberBlockIds: ['backend-terminal', 'frontend-terminal', 'worker-terminal']
        })
      ]
    })

    expect(action).toEqual({
      type: 'leave-group',
      terminalGroupId: 'development-group'
    })
  })

  it('keeps the container when moving its last workflow out', () => {
    const action = resolveTerminalGroupDropAction({
      graph: createGraph(),
      draggedNode: createTerminalNode({
        id: 'backend-terminal',
        position: { x: 1180, y: 260 }
      }),
      nodes: [
        createGroupNode({
          id: 'development-group',
          position: { x: 300, y: 180 },
          size: { width: 760, height: 380 },
          memberBlockIds: ['backend-terminal', 'frontend-terminal']
        })
      ]
    })

    expect(action).toEqual({
      type: 'leave-group',
      terminalGroupId: 'development-group'
    })
  })

  it('uses persisted group bounds when deciding whether a member leaves the group', () => {
    const action = resolveTerminalGroupDropAction({
      graph: createGraph({
        memberBlockIds: ['backend-terminal', 'frontend-terminal', 'worker-terminal']
      }),
      draggedNode: createTerminalNode({
        id: 'backend-terminal',
        position: { x: 1180, y: 260 }
      }),
      nodes: [
        createGroupNode({
          id: 'development-group',
          position: { x: 300, y: 180 },
          size: { width: 1400, height: 380 },
          memberBlockIds: ['backend-terminal', 'frontend-terminal', 'worker-terminal']
        })
      ]
    })

    expect(action).toEqual({
      type: 'leave-group',
      terminalGroupId: 'development-group'
    })
  })

  it('updates only the affected group and reuses an unchanged preview snapshot', () => {
    const terminal = createTerminalNode({ id: 'worker-terminal', position: { x: 420, y: 260 } })
    const targetGroup = createGroupNode({
      id: 'development-group',
      position: { x: 300, y: 180 },
      size: { width: 760, height: 380 },
      memberBlockIds: ['backend-terminal', 'frontend-terminal']
    })
    const unaffectedGroup = createGroupNode({
      id: 'operations-group',
      position: { x: 1400, y: 180 },
      size: { width: 760, height: 380 },
      memberBlockIds: []
    })
    const nodes = [targetGroup, unaffectedGroup, terminal]
    const action = { type: 'join-group', terminalGroupId: targetGroup.id } as const
    const projectedNodes = projectTerminalGroupDropAction(nodes, action)

    expect(projectedNodes).not.toBe(nodes)
    expect(projectedNodes[0]).not.toBe(targetGroup)
    expect((projectedNodes[0] as TerminalGroupFlowNode).data.dropFeedback).toBe('join')
    expect(projectedNodes[1]).toBe(unaffectedGroup)
    expect(projectedNodes[2]).toBe(terminal)
    expect(projectTerminalGroupDropAction(projectedNodes, action)).toBe(projectedNodes)
  })
})

function createGraph(
  input: {
    readonly memberBlockIds?: readonly string[]
  } = {}
): BlockGraphSnapshot {
  const memberBlockIds = input.memberBlockIds ?? ['backend-terminal', 'frontend-terminal']

  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      createBlock('backend-terminal', { x: 320, y: 240 }),
      createBlock('frontend-terminal', { x: 780, y: 240 }),
      createBlock('worker-terminal', { x: 1120, y: 240 })
    ],
    terminalGroups: [
      {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        position: { x: 300, y: 180 },
        size: { width: 760, height: 380 },
        isCollapsed: false,
        memberBlockIds
      }
    ]
  }
}

function createBlock(id: string, position: { readonly x: number; readonly y: number }) {
  return {
    id,
    type: 'terminal' as const,
    name: id,
    description: '本地终端',
    launchCommand: '',
    position,
    size: { width: 420, height: 306 }
  }
}

function createTerminalNode(input: {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
}): TerminalFlowNode {
  const block = createBlock(input.id, input.position)

  return {
    id: input.id,
    type: 'terminal',
    position: input.position,
    style: block.size,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal',
        objectId: input.id
      },
      block,
      session: createIdleTerminalState(),
      isSelected: false,
      isTerminalGroupSelectionMode: true,
      canSelectForTerminalGroup: true,
      isNavigationHighlighted: false,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onQuickLaunch: vi.fn(),
      onRestart: vi.fn(),
      onDelete: vi.fn(),
      onUpdateDefinition: vi.fn(),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(),
      onToggleTerminalGroupCandidate: vi.fn()
    }
  }
}

function createGroupNode(input: {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
  readonly memberBlockIds: readonly string[]
}): TerminalGroupFlowNode {
  return {
    id: input.id,
    type: 'terminalGroup',
    position: input.position,
    style: input.size,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal-group',
        objectId: input.id
      },
      group: {
        id: input.id,
        type: 'terminal-group',
        name: '启动项目',
        position: input.position,
        size: input.size,
        isCollapsed: false,
        memberBlockIds: input.memberBlockIds
      },
      memberBlocks: [],
      memberStates: {},
      selectedUngroupedTerminalBlockIds: [],
      selectedMemberBlockIds: [],
      isSelected: false,
      dropFeedback: null,
      onStartGroup: vi.fn(),
      onStopGroup: vi.fn(),
      onRestartGroup: vi.fn(),
      onUpdateGroupMetadata: vi.fn(),
      onToggleGroupCollapsed: vi.fn(),
      onAddSelectedTerminalsToGroup: vi.fn(),
      onRemoveSelectedTerminalsFromGroup: vi.fn(),
      onRemoveTerminalFromGroup: vi.fn(),
      onDissolveGroup: vi.fn()
    }
  }
}
