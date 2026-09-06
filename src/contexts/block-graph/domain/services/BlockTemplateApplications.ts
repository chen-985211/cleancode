import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockTemplateSnapshot,
  InstantiatedBlockTemplateSnapshot
} from '../aggregates/BlockTemplateTypes'
import type { BlockTemplateApplicationSnapshot } from '../aggregates/BlockGraphTypes'

export class BlockTemplateApplications {
  private readonly records: BlockTemplateApplicationSnapshot[]

  constructor(records: readonly BlockTemplateApplicationSnapshot[] = []) {
    if (!Array.isArray(records))
      throw createExpectedAppError(
        'BLOCK_TEMPLATE_INVALID',
        'Invalid template application records.'
      )
    this.records = records.map((record) => {
      if (
        !record.operationId?.trim() ||
        !record.templateId?.trim() ||
        !Array.isArray(record.blockIds) ||
        record.blockIds.length === 0 ||
        new Set(record.blockIds).size !== record.blockIds.length ||
        record.blockIds.some((id: unknown) => typeof id !== 'string' || !id.trim())
      ) {
        throw createExpectedAppError(
          'BLOCK_TEMPLATE_INVALID',
          'Invalid template application record.'
        )
      }
      const blockIds = [...record.blockIds]
      const terminalGroupId = record.terminalGroupId
      if (
        terminalGroupId !== null &&
        (typeof terminalGroupId !== 'string' || !terminalGroupId.trim())
      ) {
        throw createExpectedAppError(
          'BLOCK_TEMPLATE_INVALID',
          'Invalid template application group.'
        )
      }
      return {
        operationId: record.operationId,
        templateId: record.templateId,
        blockIds,
        terminalGroupId
      }
    })
    if (new Set(this.records.map((record) => record.operationId)).size !== this.records.length) {
      throw createExpectedAppError(
        'BLOCK_TEMPLATE_INVALID',
        'Duplicate template application record.'
      )
    }
  }

  find(operationId: string): BlockTemplateApplicationSnapshot | undefined {
    return this.records.find((record) => record.operationId === operationId)
  }

  apply(
    operationId: string,
    template: BlockTemplateSnapshot,
    create: () => InstantiatedBlockTemplateSnapshot
  ): InstantiatedBlockTemplateSnapshot {
    if (!operationId.trim())
      throw createExpectedAppError('BLOCK_TEMPLATE_INVALID', 'Empty template operation.')
    const existing = this.find(operationId)
    if (existing) {
      if (existing.templateId !== template.id) {
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_CONFLICT',
          'Template operation already committed.'
        )
      }
      return {
        blockIds: [...existing.blockIds],
        terminalGroupId: existing.terminalGroupId,
        executionScope: existing.terminalGroupId
          ? { type: 'terminal-group', terminalGroupId: existing.terminalGroupId }
          : { type: 'block-set', blockIds: existing.blockIds }
      }
    }
    const instance = create()
    this.records.push({
      operationId,
      templateId: template.id,
      blockIds: [...instance.blockIds],
      terminalGroupId: instance.terminalGroupId
    })
    return instance
  }

  snapshot(): readonly BlockTemplateApplicationSnapshot[] {
    return this.records.map((record) => ({ ...record, blockIds: [...record.blockIds] }))
  }
}
