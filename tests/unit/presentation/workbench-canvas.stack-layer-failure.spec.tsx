import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import {
  useCanvasStackDragging,
  type MoveCanvasStackHandler
} from '../../../src/contexts/canvas-arrangement/presentation/hooks/useCanvasStackDragging'
import { canvasArrangementItemKey } from '../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import { toCanvasArrangementProjectionNodes } from '../../../src/presentation/app-shell/projections/workbenchCanvasArrangementStackingProjection'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { useWorkbenchCanvasLayers } from '../../../src/presentation/app-shell/workbench/useWorkbenchCanvasLayers'

const initialNodes = [
  { id: 'terminal', type: 'terminal', position: { x: 0, y: 0 }, data: {} },
  { id: 'agent:agent', type: 'agentConsole', position: { x: 24, y: 24 }, data: {} },
  { id: 'outside', type: 'terminal', position: { x: 600, y: 0 }, data: {} }
] as WorkbenchFlowNode[]
const projectionNodes = toCanvasArrangementProjectionNodes(initialNodes)
const items = projectionNodes.map((node, index) => ({
  key: canvasArrangementItemKey(node.reference),
  reference: node.reference,
  nodeIds: [node.id],
  position: initialNodes[index]!.position,
  size: { width: 100, height: 100 }
}))
const arrangement: CanvasArrangementSnapshot = {
  projectId: 'project',
  workspaceId: 'main',
  stacks: [
    { id: 'stack', anchor: { x: 0, y: 0 }, items: items.slice(0, 2).map((i) => i.reference) }
  ],
  layerOrder: items.map((item) => item.reference)
}
const workbench = {
  project: { id: 'project', directory: '/project' },
  graph: { id: 'graph', projectId: 'project', workspaceId: 'main', blocks: [], terminalGroups: [] },
  canvasArrangement: arrangement
} as unknown as WorkbenchSnapshot

describe('stack position and layer commit outcomes', () => {
  it.each([
    { positionResult: 'saved', layerFails: false },
    { positionResult: 'saved', layerFails: true },
    { positionResult: 'false', layerFails: false },
    { positionResult: 'reject', layerFails: false },
    { positionResult: 'throw', layerFails: false }
  ])(
    'matches committed positions with position=$positionResult and layerFails=$layerFails',
    async ({ positionResult, layerFails }) => {
      let storedPositions = new Map(initialNodes.map((node) => [node.id, node.position]))
      let storedAnchor = arrangement.stacks[0]!.anchor
      let storedOrder = arrangement.layerOrder
      const onMoveCanvasStack = vi.fn<MoveCanvasStackHandler>((_id, previous, next, members) => {
        if (positionResult === 'throw') throw new Error('position write failed')
        if (positionResult === 'reject') return Promise.reject(new Error('position write failed'))
        if (positionResult === 'false') return false
        const memberIds = new Set(members.flatMap((item) => item.nodeIds))
        storedPositions = new Map(
          [...storedPositions].map(([id, position]) => [
            id,
            memberIds.has(id)
              ? { x: position.x + next.x - previous.x, y: position.y + next.y - previous.y }
              : position
          ])
        )
        storedAnchor = next
        return true
      })
      const save = vi.fn(async ({ items }: { items: CanvasArrangementSnapshot['layerOrder'] }) => {
        if (layerFails) throw new Error('layer write failed')
        storedOrder = items
      })
      const { result } = renderHook(() => {
        const [nodes, setNodes] = useState(initialNodes)
        const layers = useWorkbenchCanvasLayers({
          currentWorkbench: workbench,
          nodes,
          edges: [],
          onNodeDragStart: vi.fn(),
          onNodeDragStop: vi.fn(),
          onMoveCanvasStack,
          onSaveCanvasLayerOrder: save
        })
        const dragging = useCanvasStackDragging({
          arrangement,
          items,
          nodes,
          projectionNodes,
          onMoveCanvasStack: layers.onMoveCanvasStack,
          onNodeDragStart: layers.onNodeDragStart,
          setNodePositions: (positions) =>
            setNodes((current) =>
              current.map((node) => ({
                ...node,
                position: positions.get(node.id) ?? node.position
              }))
            )
        })
        return { nodes, layers, dragging }
      })
      const moved = { ...initialNodes[0]!, position: { x: 80, y: 40 } }
      act(() => result.current.dragging.begin({} as MouseEvent, initialNodes[0]!))
      act(() => expect(result.current.dragging.preview(moved)).toBe(true))
      expect(result.current.layers.nodeOrder).toEqual(['outside', 'terminal', 'agent:agent'])
      await act(async () => {
        expect(result.current.dragging.commit(moved)).toBe(true)
      })

      const positionSaved = positionResult === 'saved'
      expect(onMoveCanvasStack).toHaveBeenCalledExactlyOnceWith(
        'stack',
        { x: 0, y: 0 },
        { x: 80, y: 40 },
        items.slice(0, 2)
      )
      expect(new Map(result.current.nodes.map((node) => [node.id, node.position]))).toEqual(
        storedPositions
      )
      expect(storedAnchor).toEqual(positionSaved ? moved.position : { x: 0, y: 0 })
      expect(save).toHaveBeenCalledTimes(positionSaved ? 1 : 0)
      expect(result.current.layers.nodeOrder).toEqual(
        positionSaved && !layerFails
          ? ['outside', 'terminal', 'agent:agent']
          : ['terminal', 'agent:agent', 'outside']
      )
      expect(storedOrder).toEqual(
        positionSaved && !layerFails
          ? [items[2]!.reference, items[0]!.reference, items[1]!.reference]
          : arrangement.layerOrder
      )
    }
  )
})
