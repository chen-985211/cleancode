export const applicationQuitChannels = {
  requested: 'cleancode:application-quit-requested',
  show: 'cleancode:show-application-quit-confirmation'
} as const

export interface ApplicationQuitRequest {
  readonly requestId: string
}

export interface ApplicationQuitDialogCopy {
  readonly cancelLabel: string
  readonly confirmLabel: string
  readonly message: string
}

export interface ApplicationQuitConfirmationCommand
  extends ApplicationQuitRequest, ApplicationQuitDialogCopy {}

export function isApplicationQuitRequest(value: unknown): value is ApplicationQuitRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    isNonEmptyText((value as Partial<ApplicationQuitRequest>).requestId)
  )
}

export function isApplicationQuitConfirmationCommand(
  value: unknown
): value is ApplicationQuitConfirmationCommand {
  if (typeof value !== 'object' || value === null || Object.keys(value).length !== 4) return false

  const command = value as Partial<ApplicationQuitConfirmationCommand>
  return (
    isNonEmptyText(command.requestId) &&
    isNonEmptyText(command.message) &&
    isNonEmptyText(command.cancelLabel) &&
    isNonEmptyText(command.confirmLabel)
  )
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160
}
