export interface LineViolation {
  readonly filePath: string
  readonly lineCount: number
}

export interface LineGateCollectOptions {
  readonly cwd?: string
  readonly maxLines?: number
}

export interface LineGateLogger {
  readonly log: (message: string) => void
  readonly error: (message: string) => void
}

export const defaultMaxLines: 700

export function countTextLines(text: string): number

export function isCodeFile(filePath: string): boolean

export function collectLineViolations(
  filePaths: readonly string[],
  options?: LineGateCollectOptions
): LineViolation[]

export function listAllCodeFiles(cwd?: string): string[]

export function listChangedCodeFiles(cwd?: string): string[]

export function runLineGate(argv?: readonly string[], cwd?: string, logger?: LineGateLogger): number
