import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { CreateCanvasStackUseCase } from '../../contexts/canvas-arrangement/application/use-cases/CreateCanvasStackUseCase'
import { GetCanvasArrangementUseCase } from '../../contexts/canvas-arrangement/application/use-cases/GetCanvasArrangementUseCase'
import { MoveCanvasStackUseCase } from '../../contexts/canvas-arrangement/application/use-cases/MoveCanvasStackUseCase'
import { ReconcileCanvasArrangementUseCase } from '../../contexts/canvas-arrangement/application/use-cases/ReconcileCanvasArrangementUseCase'
import { RemoveCanvasStackUseCase } from '../../contexts/canvas-arrangement/application/use-cases/RemoveCanvasStackUseCase'
import { FileSystemCanvasArrangementRepository } from '../../contexts/canvas-arrangement/infrastructure/persistence/FileSystemCanvasArrangementRepository'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import { registerCanvasArrangementIpcHandlers } from './canvasArrangementIpcHandlers'
import { resolveValidCanvasArrangementItemKeys } from './canvasArrangementReconciliationAdapter'

export function createCanvasArrangementRuntime(storageDirectory: string) {
  const repository = new FileSystemCanvasArrangementRepository(storageDirectory)
  const createStack = new CreateCanvasStackUseCase(repository)
  const getArrangement = new GetCanvasArrangementUseCase(repository)
  const moveStack = new MoveCanvasStackUseCase(repository)
  const reconcileArrangement = new ReconcileCanvasArrangementUseCase(repository)
  const removeStack = new RemoveCanvasStackUseCase(repository)

  return {
    registerIpcHandlers(ipcMain: IpcMainLike, logger: Logger): void {
      registerCanvasArrangementIpcHandlers({
        createStack: (command) => createStack.execute(command),
        ipcMain,
        logger,
        moveStack: (command) => moveStack.execute(command),
        removeStack: (command) => removeStack.execute(command)
      })
    },
    async loadWorkspace(input: {
      readonly agents: readonly WorkspaceAgentSnapshot[]
      readonly graph: BlockGraphSnapshot
      readonly projectDirectory: string
      readonly projectId: string
      readonly workspaceId: string
    }): Promise<CanvasArrangementSnapshot> {
      let arrangement = await getArrangement.execute(input)
      if (arrangement.stacks.length === 0) return arrangement

      arrangement = await reconcileArrangement.execute({
        projectDirectory: input.projectDirectory,
        projectId: input.projectId,
        validItemKeys: resolveValidCanvasArrangementItemKeys(
          arrangement,
          input.graph,
          input.agents
        ),
        workspaceId: input.workspaceId
      })
      return arrangement
    }
  }
}
