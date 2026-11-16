import { createContext, useContext } from 'react'
import type { ApplicationUpdateSnapshot } from '../../../../platform/ipc/applicationUpdateChannels'

export interface ApplicationUpdateView {
  readonly snapshot: ApplicationUpdateSnapshot
  readonly actionFailed: boolean
  readonly check: () => void
  readonly showRestart: () => void
}

export const unavailableUpdate: ApplicationUpdateSnapshot = {
  revision: -1,
  status: 'unavailable',
  version: null,
  percent: null,
  unavailableReason: 'development'
}
export const ApplicationUpdateContext = createContext<ApplicationUpdateView>({
  snapshot: unavailableUpdate,
  actionFailed: false,
  check: () => undefined,
  showRestart: () => undefined
})
export function useApplicationUpdate(): ApplicationUpdateView {
  return useContext(ApplicationUpdateContext)
}
