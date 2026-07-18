import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  UpdateTerminalBlockMetadataInput,
  UpdateTerminalDefinitionInput
} from '../aggregates/BlockGraphTypes'
import { normalizeTerminalLaunchCommand } from './BlockGraphNormalization'
import { validateTerminalExecutionConfig } from './TerminalWorkflowRules'

export function normalizeTerminalBlockMetadata(input: UpdateTerminalBlockMetadataInput) {
  const name = normalizeTerminalBlockName(input.name)

  return {
    description: input.description.trim(),
    launchCommand: normalizeTerminalLaunchCommand(input.launchCommand),
    name
  }
}

export function normalizeTerminalDefinition(input: UpdateTerminalDefinitionInput) {
  return {
    ...normalizeTerminalBlockMetadata(input),
    executionConfig: validateTerminalExecutionConfig(input.executionConfig)
  }
}

function normalizeTerminalBlockName(name: string): string {
  const normalizedName = name.trim()

  if (!normalizedName) {
    throw createExpectedAppError(
      'TERMINAL_BLOCK_NAME_EMPTY',
      'Terminal block name cannot be empty.'
    )
  }

  return normalizedName
}
