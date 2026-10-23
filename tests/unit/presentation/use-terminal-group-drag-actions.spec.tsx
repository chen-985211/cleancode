import { act, renderHook } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/projections/terminalFlowNodes'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useTerminalGroupDragActions } from '../../../src/presentation/app-shell/coordinators/useTerminalGroupDragActions'
import { createWorkbenchNodeLayoutCommitQueue } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeLayoutCommitQueue'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import { preserveWorkbenchNodeTransientLayout } from '../../../src/presentation/app-shell/projections/preserveWorkbenchNodeTransientLayout'

describe('terminal group drag actions', () => {
  it.each(['success', 'failure', 'cancel'] as const)(
    'restores an interrupted group disclosure after unrelated terminal drag %s',
    async (outcome) => {
      const { api, result, terminal, nodeStore } = setupDrag(false, false, false, true)
      const baseline = nodeStore.getNodes()
      const group = baseline.find((node) => node.type === 'terminalGroup')!
      const surface = document.createElement('section')
      surface.dataset.terminalGroupId = group.id
      surface.getBoundingClientRect = () => ({
        x: 300,
        y: 180,
        left: 300,
        top: 180,
        right: 600,
        bottom: 380,
        width: 300,
        height: 200,
        toJSON: () => ({})
      })
      document.body.append(surface)
      try {
        act(() => result.current.beginTerminalGroupDrag({} as MouseEvent, terminal))
        expect(nodeStore.getNodes().find((node) => node.id === group.id)?.style).toMatchObject({
          width: 300,
          height: 200
        })
        if (outcome === 'cancel') act(() => result.current.cancelTerminalGroupDrag())
        else {
          if (outcome === 'failure') api.moveBlock.mockRejectedValueOnce(new Error('save failed'))
          await act(async () => {
            await result.current
              .moveWorkbenchNode({} as MouseEvent, { ...terminal, position: { x: 1600, y: 1000 } })
              .catch((error) => {
                if (outcome !== 'failure') throw error
              })
          })
        }
        const restored = nodeStore.getNodes().find((node) => node.id === group.id)!
        expect(restored.style).toEqual(group.style)
        expect(restored.position).toEqual(group.position)
        expect(restored.data.objectMotion).toMatchObject({
          shellRect: {
            from: { x: 300, y: 180, width: 300, height: 200 },
            to: { x: 300, y: 180, width: 600, height: 400 }
          }
        })
        act(() => restored.data.onObjectMotionComplete?.(restored.data.objectMotion!.id))
        const projected = preserveWorkbenchNodeTransientLayout(baseline, nodeStore.getNodes())
        expect(projected.find((node) => node.id === group.id)?.style).toEqual(group.style)
        expect(projected.find((node) => node.id === group.id)?.data.objectMotion).toBeUndefined()
      } finally {
        surface.remove()
      }
    }
  )
  it.each([false, true])(
    'keeps a terminal title drag scoped to that terminal when it crosses a workflow label, grouped=%s',
    async (grouped) => {
      const { api, result, terminal, nodeStore } = setupDrag(false, grouped, true)
      const handle = document.createElement('button')
      handle.dataset.canvasDragScope = 'workflow'
      handle.dataset.canvasDragTarget = JSON.stringify({
        type: 'workflow',
        terminalBlockIds: [terminal.id, 'peer']
      })
      const event = new MouseEvent('pointermove')
      Object.defineProperty(event, 'target', { value: handle })
      const moved = { ...terminal, position: { x: 1500, y: 900 } }
      // D3 supplies the move event that crosses its threshold, not pointer-down.
      act(() => result.current.beginTerminalGroupDrag(event, terminal))
      nodeStore.setNodes((nodes) => nodes.map((node) => (node.id === terminal.id ? moved : node)))
      act(() => result.current.previewTerminalGroupDrop(event, moved))
      await act(() => result.current.moveWorkbenchNode(event, moved))
      expect(api.moveTerminalWorkflowToGroup).not.toHaveBeenCalled()
      if (grouped) {
        expect(api.moveBlock).not.toHaveBeenCalled()
        expect(nodeStore.getNodes().find((node) => node.id === terminal.id)?.position).toEqual(
          terminal.position
        )
      } else {
        expect(api.moveBlock).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ blockId: terminal.id, position: moved.position })
        )
      }
    }
  )

  it('keeps the explicitly captured workflow scope when its pointer crosses a terminal title', async () => {
    const { api, result, terminal } = setupDrag(false, false, true)
    const event = new MouseEvent('pointermove')
    Object.defineProperty(event, 'target', { value: document.createElement('div') })
    act(() => result.current.beginTerminalGroupDrag(event, terminal, [terminal.id, 'peer']))
    const moved = { ...terminal, position: { x: 1500, y: 900 } }
    act(() => result.current.previewTerminalGroupDrop(event, moved))
    await act(() => result.current.moveWorkbenchNode(event, moved))
    expect(api.moveTerminalWorkflowToGroup).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        scope: 'workflow',
        expectedBlockIds: [terminal.id, 'peer']
      })
    )
  })

  it.each([false, true])(
    'previews a drop without editing and commits once, collapsed=%s',
    async (isCollapsed) => {
      const { api, result, nodeStore, terminal } = setupDrag(isCollapsed)
      const event = {} as MouseEvent
      act(() => result.current.beginTerminalGroupDrag(event, terminal))
      const target = nodeStore.getNodes().find((node) => node.type === 'terminalGroup')!
      const moved = {
        ...terminal,
        position: {
          x:
            target.position.x + Number(target.style?.width) / 2 - Number(terminal.style?.width) / 2,
          y:
            target.position.y +
            Number(target.style?.height) / 2 -
            Number(terminal.style?.height) / 2
        }
      }
      act(() => result.current.previewTerminalGroupDrop(event, moved))
      expect(api.moveTerminalWorkflowToGroup).not.toHaveBeenCalled()
      expect(
        nodeStore.getNodes().find((node) => node.type === 'terminalGroup')?.data.dropFeedback
      ).toBe('join')
      await act(() => result.current.moveWorkbenchNode(event, moved))
      expect(api.moveTerminalWorkflowToGroup).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          blockId: 'terminal-1',
          targetTerminalGroupId: 'group',
          scope: 'terminal'
        })
      )
    }
  )

  it('uses the boundary captured at drag start even if a later projection grows it', async () => {
    const { api, result, nodeStore, terminal } = setupDrag(false, true)
    act(() => result.current.beginTerminalGroupDrag({} as MouseEvent, terminal))
    nodeStore.setNodes((nodes) =>
      nodes.map((node) =>
        node.type === 'terminalGroup' ? { ...node, style: { width: 2000, height: 2000 } } : node
      )
    )
    const moved = { ...terminal, position: { x: 1200, y: 220 } }
    act(() => result.current.previewTerminalGroupDrop({} as MouseEvent, moved))
    await act(() => result.current.moveWorkbenchNode({} as MouseEvent, moved))
    expect(api.moveTerminalWorkflowToGroup).toHaveBeenCalledWith(
      expect.objectContaining({ targetTerminalGroupId: null })
    )
  })

  it('springs a member back to its exact slot without a membership command or sibling layout', async () => {
    const { api, result, nodeStore, terminal } = setupDrag(false, true)
    act(() => result.current.beginTerminalGroupDrag({} as MouseEvent, terminal))
    const moved = { ...terminal, position: { x: 450, y: 280 } }
    nodeStore.setNodes((nodes) => nodes.map((node) => (node.id === terminal.id ? moved : node)))
    await act(() => result.current.moveWorkbenchNode({} as MouseEvent, moved))
    expect(api.moveTerminalWorkflowToGroup).not.toHaveBeenCalled()
    expect(api.moveBlock).not.toHaveBeenCalled()
    expect(nodeStore.getNodes().find((node) => node.id === terminal.id)).toMatchObject({
      position: terminal.position,
      data: {
        isObjectMotionFrozen: false,
        objectMotion: { kind: 'group-reflow', offset: { x: 450, y: 280 } }
      }
    })
    expect(
      nodeStore.getNodes().find((node) => node.type === 'terminalGroup')?.data.isObjectMotionFrozen
    ).toBe(false)
    const returning = nodeStore.getNodes().find((node) => node.id === terminal.id)!
    expect(returning.data.onObjectMotionComplete).toBeTypeOf('function')
    act(() => returning.data.onObjectMotionComplete!(returning.data.objectMotion!.id))
    expect(
      nodeStore.getNodes().find((node) => node.id === terminal.id)?.data.objectMotion
    ).toBeUndefined()
  })

  it.each([
    { grouped: false, position: { x: 1500, y: 900 } },
    { grouped: false, position: { x: 450, y: 280 } },
    { grouped: true, position: { x: 1500, y: 900 } },
    { grouped: true, position: { x: 450, y: 280 } }
  ])(
    'preserves workflow membership and only restores grouped slots: $grouped, $position',
    async ({ grouped, position }) => {
      const { api, result, nodeStore, terminal } = setupDrag(false, grouped, true)
      const original = nodeStore.getNodes()
      act(() => result.current.beginTerminalGroupDrag({} as MouseEvent, terminal))
      const moved = { ...terminal, position }
      nodeStore.setNodes((nodes) => nodes.map((node) => (node.id === terminal.id ? moved : node)))
      act(() => result.current.previewTerminalGroupDrop({} as MouseEvent, moved))
      expect(
        nodeStore.getNodes().find((node) => node.type === 'terminalGroup')?.data.dropFeedback
      ).toBeNull()
      await act(() => result.current.moveWorkbenchNode({} as MouseEvent, moved))
      expect(api.moveTerminalWorkflowToGroup).not.toHaveBeenCalled()
      if (grouped) expect(api.moveBlock).not.toHaveBeenCalled()
      else
        expect(api.moveBlock).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ blockId: terminal.id, position: moved.position })
        )
      expect(nodeStore.getNodes().find((node) => node.id === terminal.id)?.position).toEqual(
        grouped ? terminal.position : moved.position
      )
      expect(nodeStore.getNodes().find((node) => node.id === 'peer')?.position).toEqual(
        original.find((node) => node.id === 'peer')?.position
      )
    }
  )

  it('restores preview positions and ignores a late release after cancellation', async () => {
    const { api, result, nodeStore, terminal } = setupDrag(false)
    act(() => result.current.beginTerminalGroupDrag({} as MouseEvent, terminal))
    const moved = { ...terminal, position: { x: 450, y: 180 } }
    nodeStore.setNodes((nodes) => nodes.map((node) => (node.id === terminal.id ? moved : node)))
    act(() => {
      result.current.previewTerminalGroupDrop({} as MouseEvent, moved)
      result.current.cancelTerminalGroupDrag()
    })
    await act(() => result.current.moveWorkbenchNode({} as MouseEvent, moved))
    expect(api.moveBlock).not.toHaveBeenCalled()
    expect(api.moveTerminalWorkflowToGroup).not.toHaveBeenCalled()
    expect(nodeStore.getNodes().find((node) => node.id === terminal.id)?.position).toEqual(
      terminal.position
    )
  })

  it.each(['success', 'failure'] as const)(
    'does not let an older %s unfreeze a newer drag',
    async (outcome) => {
      const { api, result, nodeStore } = setupDrag(false, true)
      const group = nodeStore.getNodes().find((node) => node.type === 'terminalGroup')!
      let resolve!: (graph: never) => void
      let reject!: (error: Error) => void
      api.moveTerminalGroup.mockImplementation(
        () =>
          new Promise((yes, no) => {
            resolve = yes
            reject = no
          })
      )
      act(() => result.current.beginTerminalGroupDrag({} as MouseEvent, group))
      let pending!: Promise<void>
      act(() => {
        pending = result.current.moveWorkbenchNode({} as MouseEvent, {
          ...group,
          position: { x: 500, y: 300 }
        })
      })
      act(() => {
        result.current.beginTerminalGroupDrag({} as MouseEvent, group)
        nodeStore.setNodes((nodes) =>
          nodes.map(
            (node) =>
              ({
                ...node,
                position: { x: node.position.x + 300, y: node.position.y + 100 },
                dragging: true,
                data: { ...node.data, isObjectMotionFrozen: true, isObjectDragPreview: true }
              }) as WorkbenchFlowNode
          )
        )
      })
      const latest = nodeStore.getNodes()
      await act(async () => {
        if (outcome === 'success') resolve(undefined as never)
        else reject(new Error('old move failed'))
        await pending.catch(() => undefined)
      })
      expect(nodeStore.getNodes()).toEqual(latest)
    }
  )

  it('restores authoritative terminal geometry when the layout commit fails', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/repo/app', 'app')
    const block = {
      description: '',
      id: 'terminal-1',
      launchCommand: '',
      name: 'Terminal 1',
      position: { x: 120, y: 160 },
      size: { width: 420, height: 306 },
      type: 'terminal' as const
    }
    const workbench = {
      ...baseWorkbench,
      graph: { ...baseWorkbench.graph, blocks: [block] }
    }
    const [terminalNode] = createTerminalFlowNodes({
      graph: workbench.graph,
      handlers: {} as never,
      hoveredTerminalBlockId: null,
      terminalStates: {}
    }) as TerminalFlowNode[]
    const movedNode = { ...terminalNode, position: { x: 860, y: 520 } }
    const nodeStore = createWorkbenchNodeStore([movedNode])
    const runtimeApi = createRuntimeApi()
    runtimeApi.moveBlock.mockRejectedValue(new Error('layout commit failed'))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })
    const { result } = renderHook(() =>
      useTerminalGroupDragActions({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        getNodes: nodeStore.getNodes,
        graph: workbench.graph,
        isTerminalGroupSelectionMode: false,
        layoutCommitQueue: createWorkbenchNodeLayoutCommitQueue(),
        setCurrentGraph: vi.fn(),
        setNodes: nodeStore.setNodes
      })
    )

    await expect(result.current.moveWorkbenchNode({} as MouseEvent, movedNode)).rejects.toThrow(
      'layout commit failed'
    )

    expect(nodeStore.getNodes()[0]?.position).toEqual(block.position)
  })
})

function setupDrag(
  isCollapsed: boolean,
  isMember = false,
  workflow = false,
  captureGeometry = false
) {
  const base = createWorkbenchSnapshot('/repo/app', 'app')
  const block = {
    description: '',
    id: 'terminal-1',
    launchCommand: '',
    name: 'Terminal',
    position: { x: 0, y: 0 },
    size: { width: 300, height: 42 },
    type: 'terminal' as const
  }
  const workbench = {
    ...base,
    graph: {
      ...base.graph,
      blocks: workflow ? [block, { ...block, id: 'peer', position: { x: 650, y: 250 } }] : [block],
      connections: workflow ? [{ id: 'link', sourceBlockId: block.id, targetBlockId: 'peer' }] : [],
      terminalGroups: [
        {
          id: 'group',
          type: 'terminal-group' as const,
          name: 'Group',
          position: { x: 300, y: 180 },
          size: { width: 600, height: 400 },
          isCollapsed,
          memberBlockIds: isMember ? [block.id] : []
        }
      ]
    }
  }
  const nodes = createTerminalFlowNodes({
    graph: workbench.graph,
    handlers: {} as never,
    hoveredTerminalBlockId: null,
    includeCollapsedMembers: true
  })
  const terminal = nodes.find((node) => node.type === 'terminal') as TerminalFlowNode
  const nodeStore = createWorkbenchNodeStore(nodes)
  const api = createRuntimeApi()
  Object.defineProperty(window, 'cleancode', { configurable: true, value: api })
  const { result } = renderHook(() =>
    useTerminalGroupDragActions({
      currentWorkbench: workbench,
      currentWorkspace: workbench.project.workspaces[0],
      getNodes: nodeStore.getNodes,
      graph: workbench.graph,
      layoutCommitQueue: createWorkbenchNodeLayoutCommitQueue(),
      toFlowPosition: captureGeometry ? (point) => point : undefined,
      setCurrentGraph: vi.fn(),
      setNodes: nodeStore.setNodes
    })
  )
  return { api, result, nodeStore, terminal }
}
