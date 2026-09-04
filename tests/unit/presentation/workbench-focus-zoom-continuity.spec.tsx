import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import { act, renderHook } from '@testing-library/react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { useApplicationShortcutNavigation } from '../../../src/presentation/app-shell/app-features/shortcuts/useApplicationShortcutNavigation'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useMinimapNodeFocus } from '../../../src/presentation/app-shell/workbench/minimap/useMinimapNodeFocus'
import { useCanvasSelectionViewport } from '../../../src/presentation/app-shell/workbench/viewport/useCanvasSelectionViewport'
import { cancelWorkbenchViewportMotion } from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion'

const focusEntries = ['shortcut', 'selection', 'minimap'] as const
type FocusEntry = (typeof focusEntries)[number] | 'navigation'

describe('workbench focus zoom continuity', () => {
  beforeEach(() => {
    // Drive the real camera animation through a deterministic browser clock.
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance'
      ]
    })
  })

  afterEach(() => {
    cancelWorkbenchViewportMotion()
    vi.useRealTimers()
  })

  it.each(
    focusEntries.flatMap(
      (entry) =>
        [
          { entry, interval: 100, zoom: 1, type: 'terminal' },
          { entry, interval: 200, zoom: 1, type: 'terminal' },
          { entry, interval: 300, zoom: 1, type: 'terminal' },
          { entry, interval: 200, zoom: 1.17, type: 'terminal' },
          { entry, interval: 200, zoom: 1.3, type: 'terminal' },
          { entry, interval: 200, zoom: 1.6, type: 'terminal' },
          { entry, interval: 200, zoom: 1, type: 'terminalGroup' },
          { entry, interval: 200, zoom: 1, type: 'agentConsole' }
        ] as const
    )
  )(
    'preserves $zoom zoom across repeated $entry focus of $type every $interval ms',
    async ({ entry, interval, type, zoom }) => {
      const nodes = [createNode('left', 0, type), createNode('right', 650, type)]
      const { focus, instance } = renderFocusHooks(nodes, zoom)

      for (let switchIndex = 0; switchIndex < 12; switchIndex += 1) {
        const targetIndex = switchIndex % 2 === 0 ? 1 : 0
        await act(async () => {
          focus(entry, nodes[targetIndex]!, targetIndex === 1 ? 'right' : 'left')
          await vi.advanceTimersByTimeAsync(interval)
        })
        if (switchIndex === 0) {
          // Ensure the next focus really interrupts a zoomed-out flight.
          expect(instance.getViewport().zoom).toBeLessThan(zoom)
        }
      }

      await act(async () => vi.advanceTimersByTimeAsync(1_200))

      expect(instance.getViewport()).toEqual({ x: 480, y: 320, zoom })
    }
  )

  it.each(['terminal', 'agentConsole'] as const)(
    'preserves the target when explicit %s navigation interrupts a minimap flight',
    async (type) => {
      const nodes = [createNode('left', 0, type), createNode('right', 650, type)]
      const { focus, instance } = renderFocusHooks(nodes, 1.3)

      await act(async () => {
        focus('minimap', nodes[1]!, 'right')
        await vi.advanceTimersByTimeAsync(200)
      })
      expect(instance.getViewport().zoom).toBeLessThan(1.3)

      await act(async () => {
        focus('navigation', nodes[0]!, 'left')
        await vi.advanceTimersByTimeAsync(1_200)
      })
      expect(instance.getViewport()).toEqual({ x: 480, y: 320, zoom: 1.3 })
    }
  )

  it('still fits an oversized target and restores readability on the next compact target', async () => {
    const compact = createNode('compact', 0)
    const large = createNode('large', 650, 'terminal', { width: 1_400, height: 1_000 })
    const { focus, instance } = renderFocusHooks([compact, large], 1)

    await act(async () => {
      focus('shortcut', large, 'right')
      await vi.advanceTimersByTimeAsync(1_200)
    })
    expect(instance.getViewport().zoom).toBeCloseTo(0.4352, 4)

    await act(async () => {
      focus('selection', compact, 'left')
      await vi.advanceTimersByTimeAsync(200)
      focus('minimap', compact, 'left')
      await vi.advanceTimersByTimeAsync(1_200)
    })
    expect(instance.getViewport()).toEqual({ x: 480, y: 320, zoom: 1 })
  })
})

function renderFocusHooks(nodes: WorkbenchFlowNode[], zoom: number) {
  let viewport: Viewport = { x: 480, y: 320, zoom }
  const instance = {
    getNode: (id: string) => nodes.find((node) => node.id === id),
    getNodes: () => nodes,
    getViewport: () => viewport,
    getZoom: () => viewport.zoom,
    setViewport: async (next: Viewport) => {
      viewport = next
      return true
    }
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
  const reactFlowInstanceRef = { current: instance }
  const canvasSizeRef = { current: { width: 960, height: 640 } }
  const terminalBlocksById = new Map(
    nodes.flatMap((node) => (node.type === 'terminal' ? [[node.id, node.data.block] as const] : []))
  )
  const terminalGroupsById = new Map(
    nodes.flatMap((node) =>
      node.type === 'terminalGroup' ? [[node.id, node.data.group] as const] : []
    )
  )
  const { result } = renderHook(() => {
    const navigation = useApplicationShortcutNavigation({
      activateWorkbenchNodeInput: vi.fn(),
      canvasSizeRef,
      currentWorkbench: null,
      getNodes: () => nodes,
      onSelectWorkspace: vi.fn(),
      reactFlowInstanceRef,
      revealProjectSidebar: vi.fn(),
      selectedNodeId: nodes[0]!.id,
      selectWorkbenchNode: vi.fn(),
      workbenches: []
    })
    const selection = useCanvasSelectionViewport({
      canvasSizeRef,
      onUserAction: vi.fn(),
      reactFlowInstanceRef
    })
    const minimap = useMinimapNodeFocus({
      reactFlowInstanceRef,
      terminalBlocksById,
      terminalGroupsById,
      setSelectedAgentId: vi.fn(),
      setHoveredTerminalBlockId: vi.fn(),
      setSelectedTerminalBlockId: vi.fn(),
      setSelectedTerminalBlockIds: vi.fn(),
      setSelectedTerminalGroupId: vi.fn()
    })
    return { navigation, selection, minimap }
  })

  return {
    instance,
    focus: (entry: FocusEntry, node: WorkbenchFlowNode, direction: 'left' | 'right') => {
      if (entry === 'shortcut') result.current.navigation.selectCanvasNode(direction)
      else if (entry === 'selection') result.current.selection.focusSelectedWorkbenchNode(node.id)
      else if (entry === 'navigation' && node.type === 'terminal')
        result.current.minimap.focusTerminalBlock(node.id)
      else if (entry === 'navigation' && node.type === 'agentConsole')
        result.current.minimap.focusAgentConsole(node.data.agent, 'navigation')
      else result.current.minimap.focusWorkbenchNode(node.id)
    }
  }
}

function createNode(
  id: string,
  centerX: number,
  type: WorkbenchFlowNode['type'] = 'terminal',
  size = { width: 200, height: 180 }
): WorkbenchFlowNode {
  const position = { x: centerX - size.width / 2, y: -size.height / 2 }
  const block: TerminalBlockSnapshot = {
    id,
    type: 'terminal',
    name: id,
    description: '',
    launchCommand: '',
    position,
    size,
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
  }
  const group: TerminalGroupSnapshot = {
    id,
    type: 'terminal-group',
    name: id,
    position,
    size,
    isCollapsed: true,
    memberBlockIds: []
  }
  const agent = {
    agentId: id,
    cleancodeMcpEnabled: true,
    layout: { position, size },
    name: id,
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'main'
  }
  return {
    id: type === 'agentConsole' ? `agent:${id}` : id,
    type,
    position,
    measured: size,
    data: type === 'terminal' ? { block } : type === 'terminalGroup' ? { group } : { agent }
  } as WorkbenchFlowNode
}
