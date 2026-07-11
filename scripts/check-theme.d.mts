export interface ThemeViolation {
  readonly filePath: string
  readonly line: number
  readonly rule: string
  readonly message: string
}

export interface ThemeGateLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export function collectThemeViolations(options?: {
  readonly cwd?: string
}): Promise<ThemeViolation[]>

export function runThemeGate(options?: {
  readonly cwd?: string
  readonly logger?: ThemeGateLogger
}): Promise<number>
