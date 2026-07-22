import { createExpectedAppError } from '../../../../../shared-kernel/application/errors/AppError'

type OpenCodeConfig = Readonly<Record<string, unknown>>

export function parseInheritedOpenCodeConfig(content: string | undefined): OpenCodeConfig {
  if (!content?.trim()) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw invalidOpenCodeConfig('OPENCODE_CONFIG_CONTENT must contain valid JSON.')
  }
  if (!isRecord(parsed)) {
    throw invalidOpenCodeConfig('OPENCODE_CONFIG_CONTENT must contain a JSON object.')
  }
  validateArrayField(parsed, 'plugin')
  return parsed
}

export function createOpenCodeLaunchConfig(input: {
  readonly inherited: OpenCodeConfig
  readonly instructionPath?: string
  readonly mcp?: {
    readonly serverUrl: string
  }
  readonly pluginUrl: string
}): string {
  const plugins = [...readArray(input.inherited, 'plugin'), input.pluginUrl]
  const config: Record<string, unknown> = {
    ...input.inherited,
    plugin: plugins
  }

  if (input.instructionPath) {
    validateArrayField(input.inherited, 'instructions')
    config.instructions = [...readArray(input.inherited, 'instructions'), input.instructionPath]
  }

  if (input.mcp) {
    const inheritedMcp = input.inherited.mcp
    if (inheritedMcp !== undefined && !isRecord(inheritedMcp)) {
      throw invalidOpenCodeConfig('The inherited OpenCode mcp config must be an object.')
    }
    config.mcp = {
      ...(inheritedMcp ?? {}),
      cleancode: {
        enabled: true,
        headers: {
          Authorization: 'Bearer {env:CLEANCODE_OPENCODE_MCP_TOKEN}'
        },
        oauth: false,
        type: 'remote',
        url: input.mcp.serverUrl
      }
    }
  }

  return JSON.stringify(config)
}

function readArray(config: OpenCodeConfig, field: string): readonly unknown[] {
  const value = config[field]
  return Array.isArray(value) ? value : []
}

function validateArrayField(config: OpenCodeConfig, field: string): void {
  const value = config[field]
  if (value !== undefined && !Array.isArray(value)) {
    throw invalidOpenCodeConfig(`The inherited OpenCode ${field} config must be an array.`)
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidOpenCodeConfig(message: string) {
  return createExpectedAppError('AGENT_SESSION_INVALID', message, { providerId: 'opencode' })
}
