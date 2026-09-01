import type { BlockTemplateSnapshot } from '../../application/dto/BlockTemplateSnapshot'
import type { DeleteBlockTemplateCommand } from '../../application/use-cases/DeleteBlockTemplateUseCase'
import type { ListBlockTemplatesQuery } from '../../application/use-cases/ListBlockTemplatesUseCase'
import type { MoveBlockTemplateCommand } from '../../application/use-cases/MoveBlockTemplateUseCase'
import type { SaveBlockTemplateCommand } from '../../application/use-cases/SaveBlockTemplateUseCase'
import type { UpdateBlockTemplateCommand } from '../../application/use-cases/UpdateBlockTemplateUseCase'

export interface BlockTemplateLibraryActions {
  readonly deleteTemplate: (command: DeleteBlockTemplateCommand) => Promise<void>
  readonly listTemplates: (
    query: ListBlockTemplatesQuery
  ) => Promise<readonly BlockTemplateSnapshot[]>
  readonly moveTemplate: (command: MoveBlockTemplateCommand) => Promise<BlockTemplateSnapshot>
  readonly updateTemplate: (command: UpdateBlockTemplateCommand) => Promise<BlockTemplateSnapshot>
}

export type SaveBlockTemplateAction = (
  command: SaveBlockTemplateCommand
) => Promise<BlockTemplateSnapshot | undefined>
