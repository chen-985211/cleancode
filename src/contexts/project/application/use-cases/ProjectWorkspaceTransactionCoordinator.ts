export class ProjectWorkspaceTransactionCoordinator {
  private readonly operationTails = new Map<string, Promise<void>>()

  run<T>(projectDirectory: string, operation: () => Promise<T>): Promise<T> {
    const previousOperation = this.operationTails.get(projectDirectory) ?? Promise.resolve()
    const result = previousOperation.catch(() => undefined).then(operation)
    const operationTail = result.then(
      () => undefined,
      () => undefined
    )
    this.operationTails.set(projectDirectory, operationTail)
    void operationTail.finally(() => {
      if (this.operationTails.get(projectDirectory) === operationTail) {
        this.operationTails.delete(projectDirectory)
      }
    })
    return result
  }
}
