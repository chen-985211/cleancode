import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export const MAX_WORKSPACE_DEFAULT_AGENTS = 100

export interface WorkspaceDefaults {
  readonly templates: readonly {
    readonly templateId: string
    readonly runAfterPlacement: boolean
  }[]
  readonly agents: readonly { readonly providerId: string; readonly count: number }[]
}

export function normalizeWorkspaceDefaults(value: unknown): WorkspaceDefaults {
  if (value === undefined) return { templates: [], agents: [] }
  if (
    !value ||
    typeof value !== 'object' ||
    !('templates' in value) ||
    !Array.isArray(value.templates) ||
    !('agents' in value) ||
    !Array.isArray(value.agents)
  )
    invalid()
  const templates = value.templates.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('templateId' in item) ||
      typeof item.templateId !== 'string' ||
      !item.templateId.trim() ||
      !('runAfterPlacement' in item) ||
      typeof item.runAfterPlacement !== 'boolean'
    )
      invalid()
    return { templateId: item.templateId, runAfterPlacement: item.runAfterPlacement }
  })
  if (new Set(templates.map((item) => item.templateId)).size !== templates.length) invalid()
  const agents = value.agents.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('providerId' in item) ||
      typeof item.providerId !== 'string' ||
      !item.providerId.trim() ||
      !('count' in item) ||
      typeof item.count !== 'number' ||
      !Number.isSafeInteger(item.count) ||
      item.count < 1 ||
      item.count > MAX_WORKSPACE_DEFAULT_AGENTS
    )
      invalid()
    return { providerId: item.providerId, count: item.count }
  })
  if (
    new Set(agents.map((item) => item.providerId)).size !== agents.length ||
    agents.reduce((sum, item) => sum + item.count, 0) > MAX_WORKSPACE_DEFAULT_AGENTS
  )
    invalid()
  return { templates, agents }
}

function invalid(): never {
  throw createExpectedAppError('WORKSPACE_DEFAULTS_INVALID', 'Invalid workspace default contents.')
}
