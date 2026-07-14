export interface DocumentationViolation {
  readonly filePath: string
  readonly line?: number
  readonly rule: string
  readonly message: string
}

export interface DocumentationGateLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export function collectDocumentationViolations(options?: {
  readonly cwd?: string
}): DocumentationViolation[]

export function runDocumentationGate(cwd?: string, logger?: DocumentationGateLogger): number
