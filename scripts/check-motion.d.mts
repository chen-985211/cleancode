export interface MotionViolation {
  readonly filePath: string
  readonly line: number
  readonly rule: 'raw-motion-timing'
  readonly message: string
}

export interface MotionGateLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export function collectMotionViolations(options?: {
  readonly cwd?: string
}): Promise<MotionViolation[]>

export function runMotionGate(options?: {
  readonly cwd?: string
  readonly logger?: MotionGateLogger
}): Promise<number>
