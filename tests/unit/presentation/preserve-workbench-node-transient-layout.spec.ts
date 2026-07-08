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
  output = ''
}: {
  readonly position: { readonly x: number; readonly y: number }
  readonly style: { readonly width: number; readonly height: number }
  readonly width?: number
  readonly height?: number
  readonly measured?: { readonly width: number; readonly height: number }
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
        position: { x: 120, y: 80 },
        size: { width: 420, height: 306 }
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
