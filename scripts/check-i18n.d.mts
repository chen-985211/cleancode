export interface I18nViolation {
  readonly filePath: string
  readonly line: number
  readonly rule: string
  readonly message: string
}

export interface I18nGateLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export function collectI18nViolations(options?: { readonly cwd?: string }): I18nViolation[]

export function runI18nGate(options?: {
  readonly cwd?: string
  readonly logger?: I18nGateLogger
}): number
