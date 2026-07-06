export interface LoggingViolation {
  readonly filePath: string
  readonly rule: string
  readonly message: string
}

export interface LoggingGateOptions {
  readonly cwd?: string
}

export interface LoggingGateLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export function collectLoggingViolations(options?: LoggingGateOptions): Promise<LoggingViolation[]>

export function runLoggingGate(
  options?: LoggingGateOptions & { readonly logger?: LoggingGateLogger }
): Promise<number>
