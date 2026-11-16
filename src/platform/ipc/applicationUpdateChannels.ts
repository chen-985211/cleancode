export const applicationUpdateChannels = {
  get: 'cleancode:get-application-update',
  check: 'cleancode:check-application-update',
  install: 'cleancode:install-application-update',
  claimPrompt: 'cleancode:claim-application-update-prompt',
  changed: 'cleancode:application-update-changed'
} as const

type ApplicationUpdateStatus =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'installing'
  | 'error'

export interface ApplicationUpdateSnapshot {
  readonly revision: number
  readonly status: ApplicationUpdateStatus
  readonly version: string | null
  readonly percent: number | null
  readonly error?: 'check' | 'download' | 'install'
  readonly unavailableReason?: 'development' | 'unsigned' | 'unsupported'
}
