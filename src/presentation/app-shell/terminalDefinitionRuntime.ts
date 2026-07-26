import type {
  BlockGraphSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

export interface TerminalDefinitionRuntimeApi {
  readonly updateTerminalDefinition?: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly name: string
    readonly description: string
    readonly launchCommand: string
    readonly executionConfig: TerminalExecutionConfigSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly openTerminalServiceEndpoint?: (command: {
    readonly runId: string
    readonly sessionId: string
    readonly generation: number
  }) => Promise<void>
}

export function getTerminalDefinitionRuntimeApi(): TerminalDefinitionRuntimeApi | undefined {
  return window.cleancode as TerminalDefinitionRuntimeApi | undefined
}
