import { act, renderHook } from '@testing-library/react'
import { useWorkbenchCanvasLayers } from '../../../src/presentation/app-shell/workbench/useWorkbenchCanvasLayers'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'

const nodes = ['a', 'b', 'outside', 'last'].map(
  (id) => ({ id, type: 'terminal', position: { x: 0, y: 0 }, data: {} }) as WorkbenchFlowNode
)
const edges = [{ id: 'a-b', source: 'a', target: 'b', type: 'terminalDependency' }]
const workbench = (workspaceId: string) =>
  ({
    graph: {
      id: 'graph',
      projectId: 'project',
      workspaceId,
      blocks: [],
      terminalGroups: [],
      connections: [{ id: 'a-b', sourceBlockId: 'a', targetBlockId: 'b' }]
    }
  }) as unknown as WorkbenchSnapshot
const moved = (node: WorkbenchFlowNode) => ({ ...node, position: { x: 20, y: 30 } })
type Layers = ReturnType<typeof useWorkbenchCanvasLayers>
const order = (layers: Layers) =>
  [...layers.nodes].sort((a, b) => a.zIndex! - b.zIndex!).map((node) => node.id)
const deferred = () => {
  let resolve!: (value: boolean) => void
  let reject!: (error: Error) => void
  const promise = new Promise<boolean>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup(commit = vi.fn((): boolean | Promise<boolean> => true)) {
  const cancel = vi.fn()
  const hook = renderHook(
    ({ workspaceId, selected }) =>
      useWorkbenchCanvasLayers({
        currentWorkbench: workbench(workspaceId),
        nodes: nodes.map((node) => ({ ...node, selected })),
        edges,
        onNodeDragStart: vi.fn(),
        onNodeDragStop: commit,
        onCancelNodeDrag: cancel
      }),
    { initialProps: { workspaceId: 'main', selected: false } }
  )
  const begin = (index = 0) =>
    act(() => hook.result.current.onNodeDragStart({} as MouseEvent, nodes[index]!))
  const drop = (index = 0) =>
    act(() => {
      void hook.result.current.onNodeDragStop({} as MouseEvent, moved(nodes[index]!))
    })
  return { ...hook, commit, cancel, begin, drop }
}

describe('workbench canvas layer gesture ownership', () => {
  it('keeps the complete workflow in front during saving and after successful release and deselection', async () => {
    const pending = deferred()
    const { result, begin, drop, rerender } = setup(vi.fn(() => pending.promise))
    begin()
    expect(result.current.edges[0]!.zIndex).toBeGreaterThan(result.current.nodes[3]!.zIndex!)
    drop()
    expect(order(result.current)).toEqual(['outside', 'last', 'a', 'b'])
    await act(async () => pending.resolve(true))
    rerender({ workspaceId: 'main', selected: true })
    rerender({ workspaceId: 'main', selected: false })
    expect(order(result.current)).toEqual(['outside', 'last', 'a', 'b'])
    expect(result.current.edges[0]!.zIndex).toBeGreaterThan(result.current.nodes[3]!.zIndex!)
  })

  it.each(['false', 'reject', 'throw'])(
    'restores the previous successful ordering when a later drag fails via %s',
    async (failure) => {
      const pending = deferred()
      const commit = vi.fn((): boolean | Promise<boolean> => true)
      const { result, begin, drop } = setup(commit)
      begin()
      drop()
      await act(async () => undefined)
      const previous = order(result.current)
      commit.mockImplementationOnce(() => {
        if (failure === 'throw') throw new Error('save failed')
        return pending.promise
      })
      begin(2)
      drop(2)
      await act(async () => {
        if (failure === 'reject') pending.reject(new Error('save failed'))
        else pending.resolve(false)
      })
      expect(order(result.current)).toEqual(previous)
    }
  )

  it('cancels only the active drag and keeps previously committed ordering', async () => {
    const { result, begin, drop, cancel } = setup()
    begin()
    drop()
    await act(async () => undefined)
    const previous = order(result.current)
    begin(2)
    act(() => result.current.onCancelNodeDrag('outside'))
    expect(order(result.current)).toEqual(previous)
    expect(cancel).toHaveBeenCalledWith('outside')
  })

  it('does not change ordering on a release without displacement', async () => {
    const { result, begin } = setup()
    begin()
    await act(async () => {
      await result.current.onNodeDragStop({} as MouseEvent, nodes[0]!)
    })
    expect(order(result.current)).toEqual(['a', 'b', 'outside', 'last'])
  })

  it.each([false, true])(
    'keeps later successful drags when an earlier save settles with %s',
    async (success) => {
      const first = deferred(),
        second = deferred()
      const commit = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const { result, begin, drop } = setup(commit)
      begin()
      drop()
      begin(2)
      drop(2)
      await act(async () => second.resolve(true))
      await act(async () => first.resolve(success))
      expect(order(result.current)).toEqual(
        success ? ['last', 'a', 'b', 'outside'] : ['a', 'b', 'last', 'outside']
      )
    }
  )

  it('does not let a failed earlier drag undo a newer successful drag of the same workflow', async () => {
    const first = deferred(),
      second = deferred()
    const { result, begin, drop } = setup(
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    )
    begin()
    drop()
    begin(1)
    drop(1)
    await act(async () => second.resolve(true))
    await act(async () => first.reject(new Error('old save failed')))
    expect(order(result.current)).toEqual(['outside', 'last', 'a', 'b'])
  })

  it('ignores late results across workspace changes even when node IDs are reused', async () => {
    const pending = deferred()
    const { result, rerender, begin, drop } = setup(vi.fn(() => pending.promise))
    begin()
    drop()
    rerender({ workspaceId: 'other', selected: false })
    rerender({ workspaceId: 'main', selected: false })
    await act(async () => pending.resolve(true))
    expect(order(result.current)).toEqual(['a', 'b', 'outside', 'last'])
  })
})
