export class ProjectRegistryTransactionCoordinator {
  private operationTail: Promise<void> = Promise.resolve()

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.catch(() => undefined).then(operation)
    const operationTail = result.then(
      () => undefined,
      () => undefined
    )
    this.operationTail = operationTail
    void operationTail.finally(() => {
      if (this.operationTail === operationTail) {
        this.operationTail = Promise.resolve()
      }
    })
    return result
  }
}
