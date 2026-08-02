export type TestStabilityRule =
  'no-action-retry-loop' | 'no-fixed-time-wait' | 'no-raw-test-sleep' | 'no-test-retry'

export interface TestStabilityViolation {
  readonly filePath: string
  readonly line: number
  readonly message: string
  readonly rule: TestStabilityRule
}

export interface TestStabilityGateLogger {
  readonly error: (message: string) => void
  readonly log: (message: string) => void
}

export function collectTestStabilityViolations(options?: {
  readonly cwd?: string
}): TestStabilityViolation[]

export function runTestStabilityGate(options?: {
  readonly cwd?: string
  readonly logger?: TestStabilityGateLogger
}): number
