import { act, renderHook } from '@testing-library/react'
import { useWorkbenchCanvasLayers } from '../../../src/presentation/app-shell/workbench/useWorkbenchCanvasLayers'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import type { CanvasLayerItemReference } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { SaveCanvasLayerOrderCommand } from '../../../src/contexts/canvas-arrangement/application/use-cases/SaveCanvasLayerOrderUseCase'

const nodes = ['a', 'b', 'outside', 'agent:agent'].map(
  (id) =>
    ({
      id,
      type: id.startsWith('agent:') ? 'agentConsole' : 'terminal',
      position: { x: 0, y: 0 },
      data: {}
    }) as WorkbenchFlowNode
)
const references: CanvasLayerItemReference[] = [
  { kind: 'terminal', terminalId: 'a' },
  { kind: 'terminal', terminalId: 'b' },
  { kind: 'terminal', terminalId: 'outside' },
  { kind: 'agent', agentId: 'agent' }
]
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup() {
  const stored = new Map<string, readonly CanvasLayerItemReference[]>([['main', references]])
  const save = vi.fn(async (command: SaveCanvasLayerOrderCommand) => {
    stored.set(command.workspaceId, command.items)
  })
  const commit = vi.fn((): boolean | Promise<boolean> => true)
  const mount = () =>
    renderHook(
      ({ workspaceId }) =>
        useWorkbenchCanvasLayers({
          currentWorkbench: {
            project: { id: 'project', directory: '/project' },
            graph: {
              id: 'graph',
              projectId: 'project',
              workspaceId,
              blocks: [],
              terminalGroups: [],
              connections: [{ id: 'a-b', sourceBlockId: 'a', targetBlockId: 'b' }]
            },
            canvasArrangement: {
              projectId: 'project',
              workspaceId,
              stacks: [],
              layerOrder: stored.get(workspaceId)
            }
          } as unknown as WorkbenchSnapshot,
          nodes,
          edges: [{ id: 'a-b', source: 'a', target: 'b', type: 'terminalDependency' }],
          onNodeDragStart: vi.fn(),
          onNodeDragStop: commit,
          onSaveCanvasLayerOrder: save
        }),
      { initialProps: { workspaceId: 'main' } }
    )
  const hook = mount()
  const begin = (index = 0) =>
    act(() => hook.result.current.onNodeDragStart({} as MouseEvent, nodes[index]!))
  const drop = (index = 0) => {
    let completed!: Promise<boolean | void>
    act(() => {
      completed = Promise.resolve(
        hook.result.current.onNodeDragStop({} as MouseEvent, {
          ...nodes[index]!,
          position: { x: 30, y: 20 }
        })
      )
    })
    return completed
  }
  const order = () => hook.result.current.nodeOrder
  return { ...hook, stored, save, commit, mount, begin, drop, order }
}

describe('committed canvas layer ordering', () => {
  it('discards an unreleased gesture across workspace changes instead of resurrecting it on return', () => {
    const s = setup()
    s.begin()
    s.rerender({ workspaceId: 'other' })
    s.rerender({ workspaceId: 'main' })
    expect(s.order()).toEqual(nodes.map((node) => node.id))
    expect(s.save).not.toHaveBeenCalled()
  })

  it('restores typed order after remount and workspace switching without writing on selection or mount', async () => {
    const s = setup()
    s.begin()
    await act(async () => {
      await s.drop()
    })
    expect(s.save).toHaveBeenCalledTimes(1)
    expect(s.stored.get('main')).toEqual([
      references[2],
      references[3],
      references[0],
      references[1]
    ])
    s.rerender({ workspaceId: 'other' })
    expect(s.order()).toEqual(nodes.map((node) => node.id))
    s.rerender({ workspaceId: 'main' })
    expect(s.order()).toEqual(['outside', 'agent:agent', 'a', 'b'])
    s.unmount()
    const reopened = s.mount()
    expect(reopened.result.current.nodeOrder).toEqual(['outside', 'agent:agent', 'a', 'b'])
    expect(s.save).toHaveBeenCalledTimes(1)
  })

  it.each(['cancel', 'no-movement', 'false', 'reject'])(
    'does not save a %s drag',
    async (reason) => {
      const s = setup()
      s.begin()
      if (reason === 'cancel') act(() => s.result.current.onCancelNodeDrag('a'))
      else if (reason === 'no-movement')
        await act(async () => {
          await s.result.current.onNodeDragStop({} as MouseEvent, nodes[0]!)
        })
      else {
        s.commit.mockImplementationOnce(() =>
          reason === 'false' ? false : Promise.reject(new Error('position failed'))
        )
        await act(async () => {
          await s.drop()
        })
      }
      expect(s.save).not.toHaveBeenCalled()
      expect(s.order()).toEqual(nodes.map((node) => node.id))
      expect(s.stored.get('main')).toEqual(references)
    }
  )

  it('retains position success while rolling back a failed layer write', async () => {
    const s = setup()
    s.save.mockRejectedValueOnce(new Error('disk full'))
    s.begin()
    await act(async () => {
      expect(await s.drop()).toBe(true)
    })
    expect(s.order()).toEqual(nodes.map((node) => node.id))
    expect(s.stored.get('main')).toEqual(references)
    s.begin(2)
    await act(async () => {
      await s.drop(2)
    })
    expect(s.stored.get('main')).toEqual([
      references[0],
      references[1],
      references[3],
      references[2]
    ])
  })

  it.each([true, false])(
    'saves in gesture order when the earlier position commit finishes last with %s',
    async (success) => {
      const s = setup(),
        first = deferred<boolean>(),
        second = deferred<boolean>()
      s.commit.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      s.begin()
      const one = s.drop()
      s.begin(2)
      const two = s.drop(2)
      await act(async () => second.resolve(true))
      expect(s.save).not.toHaveBeenCalled()
      await act(async () => {
        first.resolve(success)
        await Promise.all([one, two])
      })
      expect(s.save).toHaveBeenCalledTimes(success ? 2 : 1)
      expect(s.stored.get('main')).toEqual(
        success
          ? [references[3], references[0], references[1], references[2]]
          : [references[0], references[1], references[3], references[2]]
      )
    }
  )

  it('completes the original workspace write after switching away and unmounting', async () => {
    const s = setup(),
      pending = deferred<boolean>()
    s.commit.mockReturnValueOnce(pending.promise)
    s.begin()
    const completed = s.drop()
    s.rerender({ workspaceId: 'other' })
    s.begin(2)
    const other = s.drop(2)
    s.unmount()
    await act(async () => {
      pending.resolve(true)
      await Promise.all([completed, other])
    })
    expect(s.stored.get('main')).toEqual([
      references[2],
      references[3],
      references[0],
      references[1]
    ])
    expect(s.stored.get('other')).toEqual([
      references[0],
      references[1],
      references[3],
      references[2]
    ])
    const reopened = s.mount()
    expect(reopened.result.current.nodeOrder).toEqual(['outside', 'agent:agent', 'a', 'b'])
  })
})
