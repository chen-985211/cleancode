interface QuitEvent {
  preventDefault(): void
}
interface QuitApplication {
  on(event: 'before-quit', listener: (event: QuitEvent) => void): unknown
  quit(): void
}

export function bindApplicationQuitLifecycle(input: {
  readonly app: QuitApplication
  readonly shutdown: () => Promise<void>
}): { prepareUpdate: () => Promise<void> } {
  let ready = false
  let intent: 'quit' | 'update' | null = null
  input.app.on('before-quit', (event) => {
    if (ready) return
    event.preventDefault()
    if (intent !== null) return
    intent = 'quit'
    void input.shutdown().finally(() => {
      ready = true
      input.app.quit()
    })
  })
  return {
    async prepareUpdate() {
      if (intent === 'quit') throw new Error('Application shutdown is already in progress.')
      intent = 'update'
      await input.shutdown()
      ready = true
    }
  }
}
