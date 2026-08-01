import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import {
  noopTerminalRunLifecyclePort,
  type TerminalRunLifecyclePort
} from '../ports/TerminalRunLifecyclePort'
import { DeleteTerminalScopeUseCase } from './DeleteTerminalScopeUseCase'

export interface DeleteBlockCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
}

export class DeleteBlockUseCase {
  private readonly deleteTerminalScope: DeleteTerminalScopeUseCase

  constructor(
    graphRepository: BlockGraphRepository,
    terminalRunLifecycle: TerminalRunLifecyclePort = noopTerminalRunLifecyclePort
  ) {
    this.deleteTerminalScope = new DeleteTerminalScopeUseCase(graphRepository, terminalRunLifecycle)
  }

  async execute(command: DeleteBlockCommand): Promise<BlockGraphSnapshot> {
    return this.deleteTerminalScope.execute({
      projectDirectory: command.projectDirectory,
      target: { type: 'terminal', terminalBlockId: command.blockId },
      workspaceId: command.workspaceId
    })
  }
}
