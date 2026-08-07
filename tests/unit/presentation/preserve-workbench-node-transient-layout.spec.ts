import { preserveWorkbenchNodeTransientLayout } from '../../../src/presentation/app-shell/preserveWorkbenchNodeTransientLayout'
import type { TerminalFlowNode, WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'

describe('preserve workbench node transient layout', () => {
  it('keeps current positions and sizes while refreshing node data', () => {
    const currentNode = createTerminalNode({
      position: { x: 320, y: 240 },
      style: { width: 560, height: 420 }
    })
    const nextNode = createTerminalNode({
      position: { x: 120, y: 80 },
      style: { width: 420, height: 306 },
      output: 'streaming output'
    })

    expect(preserveWorkbenchNodeTransientLayout([nextNode], [currentNode])).toEqual([
      {
        ...nextNode,
        position: currentNode.position,
        style: currentNode.style
      }
    ])
  })

  it('keeps React Flow resize dimensions that are not stored in node style', () => {
    const currentNode = createTerminalNode({
      position: { x: 320, y: 240 },
      style: { width: 420, height: 306 },
      width: 600,
      height: 426,
      measured: { width: 600, height: 426 }
    })
    const nextNode = createTerminalNode({
      position: { x: 120, y: 80 },
      style: { width: 420, height: 306 },
      output: 'agent resize output'
    })

    expect(preserveWorkbenchNodeTransientLayout([nextNode], [currentNode])).toEqual([
      {
        ...nextNode,
        position: currentNode.position,
        style: currentNode.style,
        width: 600,
        height: 426,
        measured: { width: 600, height: 426 }
      }
    ])
  })

  it('uses the next terminal layout when the persisted block layout changes', () => {
    const currentNode = createTerminalNode({
      position: { x: 320, y: 240 },
      style: { width: 560, height: 420 },
      blockPosition: { x: 320, y: 240 },
      blockSize: { width: 560, height: 420 }
    })
    const nextNode = createTerminalNode({
      position: { x: 120, y: 80 },
      style: { width: 420, height: 306 },
      blockPosition: { x: 120, y: 80 },
      blockSize: { width: 420, height: 306 }
    })

    expect(preserveWorkbenchNodeTransientLayout([nextNode], [currentNode])).toEqual([nextNode])
  })

  it('keeps a protected terminal transient without consuming its committed layout', () => {
    const currentNode = createTerminalNode({
      position: { x: 640, y: 360 },
      style: { width: 560, height: 420 },
      blockPosition: { x: 320, y: 240 },
      blockSize: { width: 560, height: 420 }
    })
    const nextNode = createTerminalNode({
      position: { x: 120, y: 80 },
      style: { width: 560, height: 420 },
      blockPosition: { x: 120, y: 80 },
      blockSize: { width: 560, height: 420 }
    })

    const protectedProjection = preserveWorkbenchNodeTransientLayout(
      [nextNode],
      [currentNode],
      new Set(['terminal-1'])
    )

    expect(protectedProjection).toEqual([
      {
        ...nextNode,
        data: {
          ...nextNode.data,
          block: {
            ...nextNode.data.block,
            position: currentNode.data.block.position,
            size: currentNode.data.block.size
          }
        },
        position: currentNode.position,
        style: currentNode.style
      }
    ])
    expect(preserveWorkbenchNodeTransientLayout([nextNode], protectedProjection)).toEqual([
      nextNode
    ])
  })

  it('uses the next terminal group layout when the persisted group bounds change', () => {
    const currentNode = createTerminalGroupNode({
      position: { x: 288, y: 164 },
      style: { width: 984, height: 458 },
      groupPosition: { x: 288, y: 164 },
      groupSize: { width: 984, height: 458 }
    })
    const nextNode = createTerminalGroupNode({
      position: { x: 288, y: 164 },
      style: { width: 1284, height: 458 },
      groupPosition: { x: 288, y: 164 },
      groupSize: { width: 1284, height: 458 }
    })

    expect(preserveWorkbenchNodeTransientLayout([nextNode], [currentNode])).toEqual([nextNode])
  })

  it('uses the next Agent layout when its persisted canvas geometry changes', () => {
    const currentNode = createAgentNode({ x: 320, y: 140 }, { width: 440, height: 520 })
    const nextNode = createAgentNode({ x: 700, y: 220 }, { width: 520, height: 460 })

    expect(preserveWorkbenchNodeTransientLayout([nextNode], [currentNode])).toEqual([nextNode])
  })

  it('uses the next layout for newly created nodes', () => {
    const nextNode = createTerminalNode({
      position: { x: 120, y: 80 },
      style: { width: 420, height: 306 }
    })

    expect(preserveWorkbenchNodeTransientLayout([nextNode], [])).toEqual([nextNode])
  })
})

function createTerminalNode({
  position,
  style,
  width,
  height,
  measured,
  blockPosition = { x: 120, y: 80 },
  blockSize = { width: 420, height: 306 },
  output = ''
}: {
  readonly position: { readonly x: number; readonly y: number }
  readonly style: { readonly width: number; readonly height: number }
  readonly width?: number
  readonly height?: number
  readonly measured?: { readonly width: number; readonly height: number }
  readonly blockPosition?: { readonly x: number; readonly y: number }
  readonly blockSize?: { readonly width: number; readonly height: number }
  readonly output?: string
}): TerminalFlowNode {
  return {
    id: 'terminal-1',
    type: 'terminal',
    position,
    selected: true,
    zIndex: 3,
    style,
    width,
    height,
    measured,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal',
        objectId: 'terminal-1'
      },
      block: {
        id: 'terminal-1',
        type: 'terminal',
        name: 'Terminal 1',
        description: '本地终端',
        launchCommand: '',
        position: blockPosition,
        size: blockSize
      },
      session: { sessionId: 'session-1', status: 'running', output },
      isSelected: true,
      isTerminalGroupSelectionMode: false,
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

function createAgentNode(
  position: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number }
): WorkbenchFlowNode {
  const agent = {
    agentId: 'agent-1',
    cleancodeMcpEnabled: true,
    layout: { position, size },
    name: 'Agent 1',
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'main'
  }
  return {
    id: 'agent:agent-1',
    type: 'agentConsole',
    position,
    style: size,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'agent',
        objectId: 'agent-1'
      },
      agent,
      currentWorkbench: null,
      currentWorkspace: null,
      onGraphUpdated: vi.fn(),
      onMcpCapabilityChange: vi.fn(async () => undefined),
      onRemove: vi.fn(),
      onRename: vi.fn(),
      onResize: vi.fn()
    }
  }
}

function createTerminalGroupNode({
  position,
  style,
  groupPosition,
  groupSize
}: {
  readonly position: { readonly x: number; readonly y: number }
  readonly style: { readonly width: number; readonly height: number }
  readonly groupPosition: { readonly x: number; readonly y: number }
  readonly groupSize: { readonly width: number; readonly height: number }
}): WorkbenchFlowNode {
  return {
    id: 'development-group',
    type: 'terminalGroup',
    position,
    selected: true,
    zIndex: 1,
    style,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal-group',
        objectId: 'development-group'
      },
      group: {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        position: groupPosition,
        size: groupSize,
        isCollapsed: false,
        memberBlockIds: ['terminal-1', 'terminal-2']
      },
      memberBlocks: [],
      memberStates: {},
      selectedUngroupedTerminalBlockIds: [],
      selectedMemberBlockIds: [],
      isSelected: true,
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
