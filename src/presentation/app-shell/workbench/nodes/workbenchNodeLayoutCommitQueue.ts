export interface WorkbenchNodeLayoutCommitQueue {
  enqueue<TResult>(
    nodeId: string,
    commit: () => Promise<TResult>,
    apply: (result: TResult) => void
  ): Promise<void>
}

export function createWorkbenchNodeLayoutCommitQueue(): WorkbenchNodeLayoutCommitQueue {
  const generations = new Map<string, number>()
  const tails = new Map<string, Promise<void>>()

  return {
    enqueue<TResult>(
      nodeId: string,
      commit: () => Promise<TResult>,
      apply: (result: TResult) => void
    ): Promise<void> {
      const generation = (generations.get(nodeId) ?? 0) + 1
      generations.set(nodeId, generation)

      const previous = tails.get(nodeId)
      const committed = previous ? previous.then(commit, commit) : commit()
      const request = committed.then((result) => {
        if (generations.get(nodeId) === generation) apply(result)
      })
      const tail = request.then(
        () => undefined,
        () => undefined
      )
      tails.set(nodeId, tail)

      return request.finally(() => {
        if (tails.get(nodeId) !== tail) return
        tails.delete(nodeId)
        generations.delete(nodeId)
      })
    }
  }
}
