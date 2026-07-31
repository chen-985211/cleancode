import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockGraphSnapshot,
  TerminalBlockSizeSnapshot,
  TerminalExecutionConfigSnapshot,
  TerminalLayoutRegion
} from '../dto/BlockGraphSnapshot'
import { defaultTerminalExecutionConfig } from '../dto/BlockGraphSnapshot'
import type { TerminalWorkflowPlanSnapshot } from '../dto/TerminalWorkflowPlanSnapshot'
import { buildTerminalWorkflowPlan } from '../../domain/services/TerminalWorkflowPlan'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

interface CreateTerminalWorkflowTerminalInput {
  readonly description: string
  readonly executionConfig?: TerminalExecutionConfigSnapshot
  readonly launchCommand: string
  readonly name: string
  readonly ref: string
  readonly size?: TerminalBlockSizeSnapshot
}

export interface CreateTerminalWorkflowCommand {
  readonly anchorRegion: TerminalLayoutRegion
  readonly connections: readonly {
    readonly sourceRef: string
    readonly targetRef: string
  }[]
  readonly projectDirectory: string
  readonly reservedRegions: readonly TerminalLayoutRegion[]
  readonly terminalGroup?: {
    readonly memberRefs: readonly string[]
    readonly name: string
  }
  readonly terminals: readonly CreateTerminalWorkflowTerminalInput[]
  readonly workspaceId: string
}

export interface CreateTerminalWorkflowResult {
  readonly arrangedBlockIds: readonly string[]
  readonly arrangedTerminalGroupIds: readonly string[]
  readonly createdConnections: readonly {
    readonly connectionId: string
    readonly sourceRef: string
    readonly targetRef: string
  }[]
  readonly createdTerminalGroupId: string | null
  readonly createdTerminals: readonly {
    readonly blockId: string
    readonly ref: string
  }[]
  readonly graph: BlockGraphSnapshot
  readonly plan: TerminalWorkflowPlanSnapshot
}

export class CreateTerminalWorkflowUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: CreateTerminalWorkflowCommand): Promise<CreateTerminalWorkflowResult> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => {
        const terminalInputsByRef = indexTerminalInputs(command.terminals)
        validateReferences(command, terminalInputsByRef)

        const blockIdByRef = new Map<string, string>()
        const createdTerminals = command.terminals.map((terminal, terminalIndex) => {
          const block = graph.createTerminalBlock({
            description: terminal.description,
            launchCommand: terminal.launchCommand,
            name: terminal.name,
            position: { x: 0, y: terminalIndex },
            size: terminal.size
          })
          graph.updateTerminalDefinition(block.id, {
            description: terminal.description,
            executionConfig: terminal.executionConfig ?? defaultTerminalExecutionConfig,
            launchCommand: terminal.launchCommand,
            name: terminal.name
          })
          blockIdByRef.set(terminal.ref, block.id)
          return { blockId: block.id, ref: terminal.ref }
        })
        const createdConnections = command.connections.map((connection) => {
          const created = graph.connectTerminalBlocks({
            sourceBlockId: requireBlockId(blockIdByRef, connection.sourceRef),
            targetBlockId: requireBlockId(blockIdByRef, connection.targetRef)
          })
          return {
            connectionId: created.id,
            sourceRef: connection.sourceRef,
            targetRef: connection.targetRef
          }
        })
        const createdTerminalGroup = command.terminalGroup
          ? graph.createTerminalGroup({
              memberBlockIds: command.terminalGroup.memberRefs.map((ref) =>
                requireBlockId(blockIdByRef, ref)
              ),
              name: command.terminalGroup.name
            })
          : null
        const createdBlockIds = createdTerminals.map((terminal) => terminal.blockId)
        const layout = graph.arrangeTerminalLayout({
          anchorRegion: command.anchorRegion,
          blockIds: createdBlockIds,
          reservedRegions: command.reservedRegions
        })
        const plan = buildTerminalWorkflowPlan(graph.toSnapshot(), {
          blockIds: createdBlockIds,
          type: 'block-set'
        })

        return {
          arrangedBlockIds: layout.arrangedBlockIds,
          arrangedTerminalGroupIds: layout.arrangedTerminalGroupIds,
          createdConnections,
          createdTerminalGroupId: createdTerminalGroup?.id ?? null,
          createdTerminals,
          plan
        }
      }
    )

    return { ...transaction.result, graph: transaction.graph }
  }
}

function indexTerminalInputs(
  terminals: readonly CreateTerminalWorkflowTerminalInput[]
): ReadonlyMap<string, CreateTerminalWorkflowTerminalInput> {
  if (terminals.length === 0) {
    throw createExpectedAppError(
      'TERMINAL_WORKFLOW_DEFINITION_INVALID',
      'Terminal workflow must define at least one terminal.'
    )
  }

  const inputsByRef = new Map<string, CreateTerminalWorkflowTerminalInput>()
  for (const terminal of terminals) {
    if (!terminal.ref || inputsByRef.has(terminal.ref)) {
      throw createExpectedAppError(
        'TERMINAL_WORKFLOW_DEFINITION_INVALID',
        'Terminal workflow refs must be non-empty and unique.',
        { ref: terminal.ref }
      )
    }
    inputsByRef.set(terminal.ref, terminal)
  }
  return inputsByRef
}

function validateReferences(
  command: CreateTerminalWorkflowCommand,
  inputsByRef: ReadonlyMap<string, CreateTerminalWorkflowTerminalInput>
): void {
  const referencedRefs = [
    ...command.connections.flatMap((connection) => [connection.sourceRef, connection.targetRef]),
    ...(command.terminalGroup?.memberRefs ?? [])
  ]

  for (const ref of referencedRefs) {
    if (!inputsByRef.has(ref)) {
      throw createExpectedAppError(
        'TERMINAL_WORKFLOW_DEFINITION_INVALID',
        'Terminal workflow references an unknown terminal ref.',
        { ref }
      )
    }
  }
}

function requireBlockId(blockIdByRef: ReadonlyMap<string, string>, ref: string): string {
  const blockId = blockIdByRef.get(ref)
  if (!blockId) {
    throw createExpectedAppError(
      'TERMINAL_WORKFLOW_DEFINITION_INVALID',
      'Terminal workflow references an unknown terminal ref.',
      { ref }
    )
  }
  return blockId
}
