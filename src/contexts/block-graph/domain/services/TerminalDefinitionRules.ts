import { createBlockGraphDomainError } from '../errors/BlockGraphDomainError'

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
    throw createBlockGraphDomainError(
      'TERMINAL_BLOCK_NAME_EMPTY',
      'Terminal block name cannot be empty.'
    )
  }

  return normalizedName
}
