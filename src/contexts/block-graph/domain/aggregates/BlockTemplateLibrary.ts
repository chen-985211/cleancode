import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { normalizeBlockTemplate } from '../services/BlockTemplateProjection'
import type {
  BlockTemplateLibrarySnapshot,
  BlockTemplateScope,
  BlockTemplateSnapshot
} from './BlockTemplateTypes'

export class BlockTemplateLibrary {
  private constructor(private templates: BlockTemplateSnapshot[]) {}

  static empty(): BlockTemplateLibrary {
    return new BlockTemplateLibrary([])
  }

  static restore(snapshot: BlockTemplateLibrarySnapshot): BlockTemplateLibrary {
    if (snapshot.version !== 1) {
      throw createExpectedAppError(
        'BLOCK_TEMPLATE_VERSION_UNSUPPORTED',
        'Block template library version is unsupported.'
      )
    }
    if (!Array.isArray(snapshot.templates)) {
      throw createExpectedAppError(
        'BLOCK_TEMPLATE_INVALID',
        'Block template library must contain a template list.'
      )
    }

    const templates = snapshot.templates.map(normalizeBlockTemplate)
    const templateIds = new Set<string>()
    for (const template of templates) {
      if (templateIds.has(template.id)) {
        throw createExpectedAppError(
          'BLOCK_TEMPLATE_ALREADY_EXISTS',
          'Block template ids must be unique.'
        )
      }
      templateIds.add(template.id)
    }

    return new BlockTemplateLibrary(templates)
  }

  add(sourceTemplate: BlockTemplateSnapshot): BlockTemplateSnapshot {
    const template = normalizeBlockTemplate(sourceTemplate)
    if (this.templates.some((candidate) => candidate.id === template.id)) {
      throw createExpectedAppError(
        'BLOCK_TEMPLATE_ALREADY_EXISTS',
        'Block template already exists.'
      )
    }

    this.templates = [...this.templates, template]
    return template
  }

  list(scope: BlockTemplateScope): readonly BlockTemplateSnapshot[] {
    return this.templates.filter((template) => scopesEqual(template.scope, scope))
  }

  updateMetadata(
    templateId: string,
    input: {
      readonly name: string
      readonly description: string
      readonly updatedAt: string
    }
  ): BlockTemplateSnapshot {
    const current = this.requireTemplate(templateId)
    const updated = normalizeBlockTemplate({
      ...current,
      name: input.name,
      description: input.description,
      updatedAt: input.updatedAt
    })

    this.replace(updated)
    return updated
  }

  move(
    templateId: string,
    input: {
      readonly scope: BlockTemplateScope
      readonly updatedAt: string
    }
  ): BlockTemplateSnapshot {
    const current = this.requireTemplate(templateId)
    const moved = normalizeBlockTemplate({
      ...current,
      scope: input.scope,
      updatedAt: input.updatedAt
    })

    this.replace(moved)
    return moved
  }

  remove(templateId: string): void {
    this.requireTemplate(templateId)
    this.templates = this.templates.filter((template) => template.id !== templateId)
  }

  find(templateId: string): BlockTemplateSnapshot | null {
    return this.templates.find((template) => template.id === templateId) ?? null
  }

  toSnapshot(): BlockTemplateLibrarySnapshot {
    return Object.freeze({
      version: 1,
      templates: Object.freeze([...this.templates])
    })
  }

  private requireTemplate(templateId: string): BlockTemplateSnapshot {
    const normalizedId = templateId.trim()
    const template = this.templates.find((candidate) => candidate.id === normalizedId)
    if (!template) {
      throw createExpectedAppError('BLOCK_TEMPLATE_NOT_FOUND', 'Block template was not found.')
    }
    return template
  }

  private replace(template: BlockTemplateSnapshot): void {
    this.templates = this.templates.map((candidate) =>
      candidate.id === template.id ? template : candidate
    )
  }
}

function scopesEqual(left: BlockTemplateScope, right: BlockTemplateScope): boolean {
  return (
    left.type === right.type &&
    (left.type === 'global' || (right.type === 'project' && left.projectId === right.projectId))
  )
}
