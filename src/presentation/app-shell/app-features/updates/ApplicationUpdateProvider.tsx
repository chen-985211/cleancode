import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ApplicationUpdateSnapshot } from '../../../../platform/ipc/applicationUpdateChannels'
import { ApplicationUpdateContext, unavailableUpdate } from './useApplicationUpdate'
import { ApplicationUpdateRestartDialog } from './ApplicationUpdateRestartDialog'
import './application-update.css'

export function ApplicationUpdateProvider({ children }: { readonly children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(unavailableUpdate)
  const snapshotRef = useRef(snapshot)
  const [open, setOpen] = useState(false)
  const [actionFailed, setActionFailed] = useState(false)
  const [installPending, setInstallPending] = useState(false)
  const interactionRevision = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null)
  const api = window.cleancode
  const showRestart = useCallback(() => {
    interactionRevision.current += 1
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(true)
  }, [])

  useEffect(() => {
    if (
      !api?.getApplicationUpdate ||
      !api.onApplicationUpdateChanged ||
      !api.claimApplicationUpdatePrompt
    )
      return
    let active = true
    const requestedVersions = new Set<string>()
    const accept = (next: ApplicationUpdateSnapshot) => {
      if (
        !active ||
        !next ||
        !Number.isSafeInteger(next.revision) ||
        next.revision <= snapshotRef.current.revision
      )
        return
      snapshotRef.current = next
      setSnapshot(next)
      setActionFailed(false)
      if (next.status === 'ready' && next.version && !requestedVersions.has(next.version)) {
        const version = next.version
        const revision = interactionRevision.current
        requestedVersions.add(version)
        void api.claimApplicationUpdatePrompt({ version }).then(
          (claimed) => {
            if (
              active &&
              claimed &&
              interactionRevision.current === revision &&
              snapshotRef.current.status === 'ready' &&
              snapshotRef.current.version === version
            )
              showRestart()
          },
          () => {
            // A prompt transport error must not be presented as an installation failure.
            requestedVersions.delete(version)
          }
        )
      }
    }
    // Subscribe first: a newer live event must beat an older initial query result.
    const unsubscribe = api.onApplicationUpdateChanged(accept)
    void api.getApplicationUpdate().then(accept, () => {
      if (active) setActionFailed(true)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [api, showRestart])

  const check = () => {
    if (!api?.checkApplicationUpdate) return
    setActionFailed(false)
    void api.checkApplicationUpdate().catch(() => setActionFailed(true))
  }
  const install = async () => {
    const current = snapshotRef.current
    if (!api?.installApplicationUpdate || !current.version || installPending) return
    setInstallPending(true)
    setActionFailed(false)
    try {
      const result = await api.installApplicationUpdate({ version: current.version })
      if (result.status === 'error') setActionFailed(true)
    } catch {
      setActionFailed(true)
    } finally {
      setInstallPending(false)
    }
  }
  return (
    <ApplicationUpdateContext value={{ snapshot, actionFailed, check, showRestart }}>
      {children}
      <ApplicationUpdateRestartDialog
        open={open}
        version={snapshot.version}
        pending={installPending || snapshot.status === 'installing'}
        failed={actionFailed || snapshot.error === 'install'}
        onOpenChange={(nextOpen) => {
          interactionRevision.current += 1
          setOpen(nextOpen)
        }}
        onInstall={() => {
          void install()
        }}
        returnFocusRef={returnFocus}
      />
    </ApplicationUpdateContext>
  )
}
