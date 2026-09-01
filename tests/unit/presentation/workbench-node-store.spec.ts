import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

describe('workbench node store', () => {
  it('publishes only referentially new node snapshots', () => {
    const nodes = [{ id: 'terminal-1', position: { x: 0, y: 0 } }] as WorkbenchFlowNode[]
    const store = createWorkbenchNodeStore(nodes)
    const listener = vi.fn()
    store.subscribe(listener)

    store.setNodes((current) => current)
    expect(listener).not.toHaveBeenCalled()

    const nextNodes = [...nodes]
    store.setNodes(nextNodes)

    expect(listener).toHaveBeenCalledOnce()
    expect(store.getNodes()).toBe(nextNodes)
  })
})
