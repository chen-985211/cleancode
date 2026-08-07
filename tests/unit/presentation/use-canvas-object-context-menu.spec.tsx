import { act, renderHook } from '@testing-library/react'
import type { MouseEvent as ReactMouseEvent } from 'react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { useCanvasObjectContextMenu } from '../../../src/presentation/app-shell/useCanvasObjectContextMenu'

describe('canvas object context menu lifecycle', () => {
  it('toggles closed when the same node receives a repeated secondary click', () => {
    const graph = createGraph('graph-1')
    const terminalNode = createTerminalNode()
    const { result } = renderHook(() =>
      useCanvasObjectContextMenu({
        edges: [],
        graph,
        nodes: [terminalNode]
      })
    )
    const firstEvent = createContextMenuEvent()
    const secondEvent = createContextMenuEvent()

    act(() => result.current.onNodeContextMenu(firstEvent, terminalNode))
    expect(result.current.nodes[0]?.data.isContextSelected).toBe(true)

    act(() => result.current.onNodeContextMenu(secondEvent, terminalNode))

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce()
    expect(secondEvent.preventDefault).toHaveBeenCalledOnce()
    expect(result.current.nodes[0]?.data.isContextSelected).toBeUndefined()
  })

  it('clears the transient target when the graph changes', () => {
    const graph = createGraph('graph-1')
    const terminalNode = createTerminalNode()
    const { result, rerender } = renderHook(
      ({ currentGraph }: { readonly currentGraph: BlockGraphSnapshot }) =>
        useCanvasObjectContextMenu({
          edges: [],
          graph: currentGraph,
          nodes: [terminalNode]
        }),
      { initialProps: { currentGraph: graph } }
    )

    act(() => {
      result.current.onNodeContextMenu(
        {
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn()
        } as unknown as ReactMouseEvent<Element>,
        terminalNode
      )
    })
    expect(result.current.nodes[0]?.data.isContextSelected).toBe(true)

    rerender({ currentGraph: createGraph('graph-2') })

    expect(result.current.nodes[0]?.data.isContextSelected).toBeUndefined()
    expect(result.current.menu).toBeNull()
  })
})

function createContextMenuEvent(): ReactMouseEvent<Element> & {
  readonly preventDefault: ReturnType<typeof vi.fn>
} {
  return {
    clientX: 100,
    clientY: 100,
    preventDefault: vi.fn()
  } as unknown as ReactMouseEvent<Element> & {
    readonly preventDefault: ReturnType<typeof vi.fn>
  }
}

function createGraph(id: string): BlockGraphSnapshot {
  return {
    id,
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      {
        id: 'terminal-1',
        type: 'terminal',
        name: 'Terminal',
        description: '',
        launchCommand: '',
        position: { x: 0, y: 0 },
        size: { width: 320, height: 240 }
      }
    ],
    connections: [],
    terminalGroups: []
  }
}

function createTerminalNode(): WorkbenchFlowNode {
  return {
    id: 'terminal-1',
    type: 'terminal',
    position: { x: 0, y: 0 },
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal',
        objectId: 'terminal-1'
      },
      block: createGraph('graph-1').blocks[0]!,
      session: {
        sessionId: null,
        status: 'idle',
        output: ''
      },
      isSelected: false,
      isTerminalGroupSelectionMode: false,
      canSelectForTerminalGroup: true,
      isNavigationHighlighted: false,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onQuickLaunch: vi.fn(),
      onRestart: vi.fn(),
      onDelete: vi.fn(),
      onUpdateDefinition: vi.fn(async () => undefined),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(async () => undefined),
      onToggleTerminalGroupCandidate: vi.fn()
    }
  }
}
