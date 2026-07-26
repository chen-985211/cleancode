export class AgentWorkspaceTransactionCoordinator {
  private readonly operationTails = new Map<string, Promise<void>>()

  run<T>(projectId: string, workspaceId: string, operation: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([projectId, workspaceId])
    const previousOperation = this.operationTails.get(key) ?? Promise.resolve()
    const result = previousOperation.catch(() => undefined).then(operation)
    const operationTail = result.then(
      () => undefined,
      () => undefined
    )
    this.operationTails.set(key, operationTail)
    void operationTail.finally(() => {
      if (this.operationTails.get(key) === operationTail) {
        this.operationTails.delete(key)
      }
    })
    return result
  }
}
