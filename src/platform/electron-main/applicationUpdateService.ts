import type { ApplicationUpdateSnapshot } from '../ipc/applicationUpdateChannels'
import type { AppUpdaterEvents } from 'electron-updater/out/AppUpdater'

export interface ApplicationUpdateBackend {
  on<K extends keyof AppUpdaterEvents>(event: K, listener: AppUpdaterEvents[K]): unknown
  removeListener<K extends keyof AppUpdaterEvents>(event: K, listener: AppUpdaterEvents[K]): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
}

export function createApplicationUpdateService(input: {
  readonly updater: ApplicationUpdateBackend
  readonly prepareRestart: () => Promise<void>
  readonly restartAfterFailedInstall: () => Promise<void>
  readonly onFailure?: (stage: 'check' | 'download' | 'install') => void
  readonly unavailableReason?: ApplicationUpdateSnapshot['unavailableReason']
}) {
  let snapshot: ApplicationUpdateSnapshot = {
    revision: 0,
    status: input.unavailableReason ? 'unavailable' : 'idle',
    version: null,
    percent: null,
    ...(input.unavailableReason ? { unavailableReason: input.unavailableReason } : {})
  }
  let disposed = false
  let checking: Promise<ApplicationUpdateSnapshot> | undefined
  let installRecoveryRequested = false
  const listeners = new Set<(value: ApplicationUpdateSnapshot) => void>()
  const update = (next: Omit<ApplicationUpdateSnapshot, 'revision'>) => {
    if (disposed) return
    snapshot = Object.freeze({ ...next, revision: snapshot.revision + 1 })
    for (const listener of listeners) {
      try {
        listener(snapshot)
      } catch {
        // A closing renderer must not turn a successful update into a download failure.
      }
    }
  }
  const fail = (stage: 'check' | 'download' | 'install') => {
    if (disposed || snapshot.status === 'error') return
    update({ status: 'error', version: snapshot.version, percent: null, error: stage })
    if (stage === 'install') {
      installRecoveryRequested = true
      void Promise.resolve()
        .then(input.restartAfterFailedInstall)
        .catch(() => input.onFailure?.('install'))
    }
    input.onFailure?.(stage)
  }
  const available = (info: { version: string }) => {
    if (snapshot.status !== 'checking' || !validVersion(info?.version)) return
    update({ status: 'available', version: info.version, percent: null })
  }
  const noUpdate = () => {
    if (snapshot.status === 'checking') update({ status: 'idle', version: null, percent: null })
  }
  const progress = (event: { percent: number }) => {
    if (snapshot.status !== 'downloading' || !Number.isFinite(event?.percent)) return
    const percent = Math.max(snapshot.percent ?? 0, Math.min(100, Math.max(0, event.percent)))
    update({
      status: percent === 100 ? 'verifying' : 'downloading',
      version: snapshot.version,
      percent
    })
  }
  const downloaded = (info: { version: string }) => {
    if (
      (snapshot.status === 'downloading' || snapshot.status === 'verifying') &&
      info?.version === snapshot.version
    )
      update({ status: 'ready', version: snapshot.version, percent: 100 })
  }
  const error = () => {
    if (snapshot.status === 'checking') fail('check')
    else if (snapshot.status === 'downloading' || snapshot.status === 'verifying') fail('download')
    else if (snapshot.status === 'installing') fail('install')
  }
  const cleanups: (() => void)[] = []
  function bind<K extends keyof AppUpdaterEvents>(event: K, listener: AppUpdaterEvents[K]) {
    input.updater.on(event, listener)
    cleanups.push(() => {
      input.updater.removeListener(event, listener)
    })
  }
  if (!input.unavailableReason) {
    bind('update-available', available)
    bind('update-not-available', noUpdate)
    bind('download-progress', progress)
    bind('update-downloaded', downloaded)
    bind('error', error)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: (value: ApplicationUpdateSnapshot) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    check(): Promise<ApplicationUpdateSnapshot> {
      if (checking) return checking
      if (
        disposed ||
        !['idle', 'error'].includes(snapshot.status) ||
        snapshot.error === 'install'
      ) {
        return Promise.resolve(snapshot)
      }
      update({ status: 'checking', version: null, percent: null })
      checking = Promise.resolve()
        .then(async () => {
          try {
            await input.updater.checkForUpdates()
          } catch {
            fail('check')
          }
          if (!disposed && snapshot.status === 'available') {
            update({ status: 'downloading', version: snapshot.version, percent: 0 })
            try {
              await input.updater.downloadUpdate()
            } catch {
              fail('download')
            }
          } else if (snapshot.status === 'checking') {
            // No installable release (or an updater that intentionally skipped its check).
            noUpdate()
          }
          return snapshot
        })
        .finally(() => {
          checking = undefined
        })
      return checking
    },
    async install(version: string): Promise<ApplicationUpdateSnapshot> {
      const canInstall =
        snapshot.status === 'ready' || (snapshot.status === 'error' && snapshot.error === 'install')
      if (disposed || installRecoveryRequested || !canInstall || version !== snapshot.version)
        return snapshot
      update({ status: 'installing', version, percent: 100 })
      try {
        await input.prepareRestart()
        if (!disposed && snapshot.status === 'installing') input.updater.quitAndInstall(true, true)
      } catch {
        fail('install')
      }
      return snapshot
    },
    dispose() {
      disposed = true
      for (const cleanup of cleanups) cleanup()
      listeners.clear()
    }
  }
}

function validVersion(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 80 && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value)
  )
}
