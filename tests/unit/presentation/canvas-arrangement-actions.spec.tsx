import { act, renderHook } from '@testing-library/react'

import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { CanvasArrangementSelectionItem } from '../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { useCanvasArrangementActions } from '../../../src/presentation/app-shell/coordinators/useCanvasArrangementActions'

describe('canvas arrangement actions', () => {
  it('creates one attached stack without a presentation state', async () => {
    const arrangement = emptyArrangement()
    const attached = arrangementWithStack()
    const createCanvasStack = vi.fn(async (command: unknown) => {
      void command
      return attached
    })
    const moveBlock = vi.fn(async () => workbench(arrangement).graph)
    installCanvasApi({ createCanvasStack, moveBlock })
    const hook = renderActions(arrangement)

    await act(() => hook.result.current.arrange('stack', selectionItems()))

    expect(createCanvasStack).toHaveBeenCalledOnce()
    expect(createCanvasStack.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        anchor: { x: 95, y: -5 },
        items: [
          { kind: 'terminal', terminalId: 'terminal-1' },
          { kind: 'terminal', terminalId: 'terminal-2' }
        ]
      })
    )
    expect(createCanvasStack.mock.calls[0]?.[0]).not.toHaveProperty('presentation')
    expect(hook.setCurrentArrangement).toHaveBeenCalledWith(attached)
  })

  it('detaches an existing stack after committing its ordered release positions', async () => {
    const arrangement = arrangementWithStack()
    const detached = emptyArrangement()
    const moveBlock = vi.fn(async () => workbench(arrangement).graph)
    const removeCanvasStack = vi.fn(async () => detached)
    installCanvasApi({ moveBlock, removeCanvasStack })
    const hook = renderActions(arrangement)

    await act(() => hook.result.current.arrange('detach-stack', selectionItems(true)))

    expect(moveBlock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ blockId: 'terminal-1', position: { x: 100, y: 100 } })
    )
    expect(moveBlock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ blockId: 'terminal-2', position: { x: 124, y: 118 } })
    )
    expect(removeCanvasStack).toHaveBeenCalledWith(expect.objectContaining({ stackId: 'stack-1' }))
    expect(hook.setCurrentArrangement).toHaveBeenCalledWith(detached)
  })

  it('restores attached positions when removing the stack relation fails', async () => {
    const arrangement = arrangementWithStack()
    const moveBlock = vi.fn(async () => workbench(arrangement).graph)
    const removeCanvasStack = vi.fn(async () => {
      throw new Error('remove failed')
    })
    installCanvasApi({ moveBlock, removeCanvasStack })
    const hook = renderActions(arrangement)

    await act(() => hook.result.current.arrange('detach-stack', selectionItems(true)))

    expect(moveBlock).toHaveBeenCalledTimes(4)
    expect(moveBlock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ blockId: 'terminal-1', position: { x: 100, y: 100 } })
    )
    expect(moveBlock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ blockId: 'terminal-2', position: { x: 110, y: 110 } })
    )
    expect(hook.notify).toHaveBeenCalledOnce()
    expect(hook.setCurrentArrangement).not.toHaveBeenCalled()
  })

  it('keeps every grid item responsive while distance shapes its spring', async () => {
    const arrangement = emptyArrangement()
    const moveResolvers: Array<(graph: WorkbenchSnapshot['graph']) => void> = []
    const moveBlock = vi.fn(
      () =>
        new Promise<WorkbenchSnapshot['graph']>((resolve) => {
          moveResolvers.push(resolve)
        })
    )
    installCanvasApi({ moveBlock })
    const hook = renderActions(arrangement)
    let arrangePromise: Promise<void> | undefined

    act(() => {
      arrangePromise = hook.result.current.arrange('grid', selectionItems())
    })

    expect(hook.result.current.motionChoreography).toEqual({
      delayByNodeId: { 'terminal-1': 0, 'terminal-2': 0 },
      kind: 'grid'
    })

    await act(async () => {
      moveResolvers.forEach((resolve) => resolve(workbench(arrangement).graph))
      await arrangePromise
    })
    expect(hook.result.current.isPending).toBe(false)
  })

  it('keeps a direct grid choreography alive through the projection frame', async () => {
    const arrangement = emptyArrangement()
    const frames: FrameRequestCallback[] = []
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback)
        return frames.length
      })
    installCanvasApi({ moveBlock: vi.fn(async () => workbench(arrangement).graph) })
    const hook = renderActions(arrangement)

    await act(() => hook.result.current.arrange('grid', selectionItems()))

    expect(hook.result.current.motionChoreography?.kind).toBe('grid')
    act(() => frames.shift()?.(16))
    expect(hook.result.current.motionChoreography?.kind).toBe('grid')
    act(() => frames.shift()?.(32))
    expect(hook.result.current.motionChoreography).toBeNull()
    requestAnimationFrame.mockRestore()
  })

  it('compacts a workflow dependency before placing the complete workflow in the grid', async () => {
    const arrangement = emptyArrangement()
    const snapshot = workflowWorkbench(arrangement)
    const moveBlock = vi.fn(
      async (command: {
        readonly blockId: string
        readonly position: { readonly x: number; readonly y: number }
      }) => {
        void command
        return snapshot.graph
      }
    )
    installCanvasApi({ moveBlock })
    const hook = renderActionsForWorkbench(snapshot)

    await act(() =>
      hook.result.current.arrange('grid', [
        {
          key: 'workflow:terminal-1,terminal-2',
          nodeIds: ['terminal-1', 'terminal-2'],
          position: { x: 0, y: 0 },
          reference: { kind: 'workflow', terminalIds: ['terminal-1', 'terminal-2'] },
          size: { height: 80, width: 1_400 }
        },
        selectionItem('terminal-3', 0, 400)
      ])
    )

    const positions = new Map(
      moveBlock.mock.calls.map(([command]) => [command.blockId, command.position] as const)
    )
    expect(positions.get('terminal-2')!.x - positions.get('terminal-1')!.x).toBe(164)
    expect(positions.get('terminal-2')!.y).toBe(positions.get('terminal-1')!.y)
  })
})

function renderActions(arrangement: CanvasArrangementSnapshot) {
  return renderActionsForWorkbench(workbench(arrangement))
}

function renderActionsForWorkbench(snapshot: WorkbenchSnapshot) {
  const setCurrentArrangement = vi.fn()
  const notify = vi.fn()
  const hook = renderHook(() =>
    useCanvasArrangementActions({
      currentWorkbench: snapshot,
      currentWorkspace: snapshot.project.workspaces[0],
      failureMessage: 'Failed',
      failureTitle: 'Arrangement',
      moveWorkspaceAgent: vi.fn(async () => undefined),
      notify,
      setCurrentArrangement,
      setCurrentGraph: vi.fn()
    })
  )
  return { ...hook, notify, setCurrentArrangement }
}

function installCanvasApi(overrides: Record<string, unknown>): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: {
      createCanvasStack: vi.fn(),
      moveBlock: vi.fn(),
      removeCanvasStack: vi.fn(),
      ...overrides
    }
  })
}

function emptyArrangement(): CanvasArrangementSnapshot {
  return { projectId: 'project-1', workspaceId: 'main', stacks: [] }
}

function arrangementWithStack(): CanvasArrangementSnapshot {
  return {
    projectId: 'project-1',
    workspaceId: 'main',
    stacks: [
      {
        id: 'stack-1',
        anchor: { x: 100, y: 100 },
        items: [
          { kind: 'terminal', terminalId: 'terminal-1' },
          { kind: 'terminal', terminalId: 'terminal-2' }
        ]
      }
    ]
  }
}

function selectionItems(attached = false): CanvasArrangementSelectionItem[] {
  return [
    selectionItem('terminal-1', attached ? 100 : 0, attached ? 100 : 0),
    selectionItem('terminal-2', attached ? 110 : 200, attached ? 110 : 0)
  ]
}

function selectionItem(terminalId: string, x: number, y: number): CanvasArrangementSelectionItem {
  return {
    key: `terminal:${terminalId}`,
    nodeIds: [terminalId],
    position: { x, y },
    reference: { kind: 'terminal', terminalId },
    size: { width: 100, height: 80 }
  }
}

function workbench(arrangement: CanvasArrangementSnapshot): WorkbenchSnapshot {
  return {
    agents: [],
    canvasArrangement: arrangement,
    gitBranches: [],
    graph: {
      blocks: [
        { id: 'terminal-1', position: { x: 100, y: 100 } },
        { id: 'terminal-2', position: { x: 110, y: 110 } }
      ],
      connections: [],
      terminalGroups: [],
      workspaceId: 'main'
    },
    project: {
      directory: '/project',
      id: 'project-1',
      name: 'Project',
      workspaces: [
        {
          directory: '/project',
          displayName: 'main',
          gitBranch: null,
          isCurrent: true,
          workspaceId: 'main',
          workspaceKind: 'default'
        }
      ]
    }
  } as unknown as WorkbenchSnapshot
}

function workflowWorkbench(arrangement: CanvasArrangementSnapshot): WorkbenchSnapshot {
  const snapshot = workbench(arrangement)
  return {
    ...snapshot,
    graph: {
      ...snapshot.graph,
      blocks: [
        { id: 'terminal-1', position: { x: 0, y: 0 }, size: { height: 80, width: 100 } },
        { id: 'terminal-2', position: { x: 1_300, y: 0 }, size: { height: 80, width: 100 } },
        { id: 'terminal-3', position: { x: 0, y: 400 }, size: { height: 80, width: 100 } }
      ],
      connections: [{ sourceBlockId: 'terminal-1', targetBlockId: 'terminal-2' }]
    }
  } as unknown as WorkbenchSnapshot
}
