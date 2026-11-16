interface QuitEvent {
  preventDefault(): void
}
interface QuitApplication {
  on(event: 'before-quit', listener: (event: QuitEvent) => void): unknown
  quit(): void
  relaunch(options?: { execPath: string }): void
}

export function bindApplicationQuitLifecycle(input: {
  readonly app: QuitApplication
  readonly shutdown: () => Promise<void>
  readonly relaunchExecutable?: string
}): {
  prepareUpdate: () => Promise<void>
  recoverFailedUpdate: (executable?: string) => Promise<void>
} {
  let ready = false
  let intent: 'quit' | 'update' | null = null
  let updatePreparation: Promise<void> | undefined
  let updateRecovery: Promise<void> | undefined
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
      updatePreparation ??= (async () => {
        await input.shutdown()
        ready = true
      })()
      await updatePreparation
    },
    recoverFailedUpdate(executable = input.relaunchExecutable) {
      if (intent !== 'update') return Promise.resolve()
      const restart = () => {
        ready = true
        try {
          input.app.relaunch(executable ? { execPath: executable } : undefined)
        } finally {
          input.app.quit()
        }
      }
      updateRecovery ??= (updatePreparation ?? Promise.resolve()).then(restart, restart)
      return updateRecovery
    }
  }
}
