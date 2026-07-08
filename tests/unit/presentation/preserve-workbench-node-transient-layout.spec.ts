import { preserveWorkbenchNodeTransientLayout } from '../../../src/presentation/app-shell/preserveWorkbenchNodeTransientLayout'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'

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
}): WorkbenchFlowNode {
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
      onUpdateMetadata: vi.fn(),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(),
      onToggleTerminalGroupCandidate: vi.fn()
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
