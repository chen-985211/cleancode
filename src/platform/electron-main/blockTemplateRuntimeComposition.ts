import type { BlockGraphRepository } from '../../contexts/block-graph/application/ports/BlockGraphRepository'
import type { BlockTemplateRepository } from '../../contexts/block-graph/application/ports/BlockTemplateRepository'
import { DeleteBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/DeleteBlockTemplateUseCase'
import { InstantiateBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase'
import { ListBlockTemplatesUseCase } from '../../contexts/block-graph/application/use-cases/ListBlockTemplatesUseCase'
import { MoveBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/MoveBlockTemplateUseCase'
import { SaveBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/SaveBlockTemplateUseCase'
import { UpdateBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/UpdateBlockTemplateUseCase'
import { registerBlockTemplateIpcHandlers } from './blockTemplateIpcHandlers'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export function createBlockTemplateRuntime(
  graphs: BlockGraphRepository,
  templates: BlockTemplateRepository
) {
  const instantiate = new InstantiateBlockTemplateUseCase(graphs, templates)
  const list = new ListBlockTemplatesUseCase(templates)
  const save = new SaveBlockTemplateUseCase(graphs, templates)
  const update = new UpdateBlockTemplateUseCase(templates)
  const move = new MoveBlockTemplateUseCase(templates)
  const remove = new DeleteBlockTemplateUseCase(templates)
  return {
    instantiate,
    register: (ipcMain: IpcMainLike, logger: Logger) =>
      registerBlockTemplateIpcHandlers({
        ipcMain,
        logger,
        instantiateBlockTemplate: (command) => instantiate.execute(command),
        listBlockTemplates: (query) => list.execute(query),
        saveBlockTemplate: (command) => save.execute(command),
        updateBlockTemplate: (command) => update.execute(command),
        moveBlockTemplate: (command) => move.execute(command),
        deleteBlockTemplate: (command) => remove.execute(command)
      })
  }
}
