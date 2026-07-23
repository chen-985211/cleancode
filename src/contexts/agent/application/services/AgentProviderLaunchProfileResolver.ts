import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentProviderLaunchConfiguration,
  AgentProviderLaunchProfile
} from '../ports/AgentProviderContribution'
import type {
  AgentPermissionMode,
  AgentProviderOverrideSnapshot
} from '../../domain/aggregates/AgentProviderPreferences'
import type { AgentProviderPreferencesRepository } from '../ports/AgentProviderPreferencesRepository'

export type AgentArgumentTokenization =
  | { readonly ok: true; readonly tokens: readonly string[] }
  | { readonly error: 'UNCLOSED_QUOTE'; readonly ok: false }

export function tokenizeAgentArguments(value: string): AgentArgumentTokenization {
  const tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | null = null
  let started = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    if (character === '\\' && index + 1 < value.length) {
      token += value[index + 1]
      started = true
      index += 1
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else token += character
      started = true
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      started = true
    } else if (/\s/.test(character)) {
      if (started) {
        tokens.push(token)
        token = ''
        started = false
      }
    } else {
      token += character
      started = true
    }
  }

  if (quote) return { error: 'UNCLOSED_QUOTE', ok: false }
  if (started) tokens.push(token)
  return { ok: true, tokens }
}

export function resolveAgentProviderLaunchProfile(input: {
  readonly configuration: AgentProviderLaunchConfiguration
  readonly override: AgentProviderOverrideSnapshot | undefined
  readonly permissionMode: AgentPermissionMode
}): AgentProviderLaunchProfile {
  const tokenization = tokenizeAgentArguments(input.override?.argumentsText ?? '')
  if (!tokenization.ok) {
    throw createExpectedAppError(
      'AGENT_PROVIDER_ARGUMENTS_INVALID',
      'Agent Provider arguments contain an unclosed quote.'
    )
  }
  const permission = input.permissionMode === 'yolo' ? input.configuration.permission : undefined
  return {
    arguments: [
      ...input.configuration.defaultArguments,
      ...(permission?.arguments ?? []),
      ...tokenization.tokens
    ],
    environment: {
      ...input.configuration.defaultEnvironment,
      ...(permission?.environment ?? {}),
      ...(input.override?.environment ?? {})
    },
    executable: input.override?.executable ?? input.configuration.executable
  }
}

export async function resolvePersistedAgentProviderLaunchProfile(
  configuration: AgentProviderLaunchConfiguration | undefined,
  preferencesRepository: AgentProviderPreferencesRepository,
  providerId: string
): Promise<AgentProviderLaunchProfile | undefined> {
  if (!configuration) return undefined
  const preferences = await preferencesRepository.load()
  return resolveAgentProviderLaunchProfile({
    configuration,
    override: preferences.providerOverrides[providerId],
    permissionMode: preferences.permissionMode
  })
}
