export interface PortablePathViolation {
  readonly filePath: string
  readonly line: number
  readonly rule: 'no-manual-path-separator' | 'no-platform-specific-path-regexp'
  readonly message: string
}

export interface PortablePathGateLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export function collectPortablePathViolations(options?: {
  readonly cwd?: string
}): PortablePathViolation[]

export function runPortablePathGate(options?: {
  readonly cwd?: string
  readonly logger?: PortablePathGateLogger
}): number
