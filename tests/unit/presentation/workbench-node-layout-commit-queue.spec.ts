import { createWorkbenchNodeLayoutCommitQueue } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeLayoutCommitQueue'

describe('workbench node layout commit queue', () => {
  it('serializes one node and only applies its latest response', async () => {
    const queue = createWorkbenchNodeLayoutCommitQueue()
    const first = createDeferred<string>()
    const second = createDeferred<string>()
    const firstCommit = vi.fn(() => first.promise)
    const secondCommit = vi.fn(() => second.promise)
    const apply = vi.fn()

    const firstRequest = queue.enqueue('terminal-1', firstCommit, apply)
    const secondRequest = queue.enqueue('terminal-1', secondCommit, apply)

    expect(firstCommit).toHaveBeenCalledOnce()
    expect(secondCommit).not.toHaveBeenCalled()

    first.resolve('old-layout')
    await firstRequest
    expect(secondCommit).toHaveBeenCalledOnce()
    expect(apply).not.toHaveBeenCalled()

    second.resolve('latest-layout')
    await secondRequest
    expect(apply).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenCalledWith('latest-layout')
  })

  it('allows different nodes to persist independently', () => {
    const queue = createWorkbenchNodeLayoutCommitQueue()
    const firstCommit = vi.fn(() => new Promise<string>(() => undefined))
    const secondCommit = vi.fn(async () => 'agent-layout')

    void queue.enqueue('terminal-1', firstCommit, vi.fn())
    void queue.enqueue('agent-1', secondCommit, vi.fn())

    expect(firstCommit).toHaveBeenCalledOnce()
    expect(secondCommit).toHaveBeenCalledOnce()
  })
})

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}
