import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export type ServiceProtocol = 'http' | 'https' | 'tcp'

type ServicePortPolicy =
  | { readonly type: 'fixed'; readonly port: number }
  | { readonly type: 'preferred'; readonly port: number }
  | { readonly type: 'auto' }

export type ServicePortBinding =
  | { readonly type: 'none' }
  | { readonly type: 'environment'; readonly variableName: string }
  | { readonly type: 'argument'; readonly template: string }

export interface ServicePortIntent {
  readonly protocol: ServiceProtocol
  readonly policy: ServicePortPolicy
  readonly binding: ServicePortBinding
}

export function validateServicePortIntent(intent: ServicePortIntent): ServicePortIntent {
  if (intent.protocol !== 'http' && intent.protocol !== 'https' && intent.protocol !== 'tcp') {
    invalid('Service protocol is invalid.')
  }
  if ('port' in intent.policy) {
    validatePort(intent.policy.port)
  }
  if (intent.policy.type !== 'fixed' && intent.binding.type === 'none') {
    invalid('Dynamic port policies require an explicit port binding.')
  }
  if (intent.binding.type === 'environment') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(intent.binding.variableName)) {
      invalid('Port environment variable name is invalid.')
    }
    if (
      intent.binding.variableName.toUpperCase().startsWith('CLEANCODE_') ||
      intent.binding.variableName.toUpperCase() === 'PROMPT_EOL_MARK'
    ) {
      invalid('Port environment variable is reserved.')
    }
  }
  if (intent.binding.type === 'argument') {
    validateArgumentTemplate(intent.binding.template)
  }

  return Object.freeze({
    protocol: intent.protocol,
    policy: Object.freeze({ ...intent.policy }),
    binding: Object.freeze({
      ...intent.binding,
      ...(intent.binding.type === 'argument' ? { template: intent.binding.template.trim() } : {})
    }) as ServicePortBinding
  })
}

export function applyServicePortBinding(input: {
  readonly launchCommand: string
  readonly environment: Readonly<Record<string, string>> | undefined
  readonly port: number
  readonly binding: ServicePortBinding
}): {
  readonly launchCommand: string
  readonly environment: Readonly<Record<string, string>> | undefined
} {
  validatePort(input.port)

  if (input.binding.type === 'none') {
    return { launchCommand: input.launchCommand, environment: input.environment }
  }
  if (input.binding.type === 'environment') {
    return {
      launchCommand: input.launchCommand,
      environment: {
        ...input.environment,
        [input.binding.variableName]: String(input.port)
      }
    }
  }

  validateArgumentTemplate(input.binding.template)
  return {
    launchCommand: `${input.launchCommand} ${input.binding.template.trim().replace('{port}', String(input.port))}`,
    environment: input.environment
  }
}

function validateArgumentTemplate(template: string): void {
  if (template.includes('\r') || template.includes('\n') || template.includes('\0')) {
    invalid('Port argument template contains unsafe shell syntax.')
  }

  const placeholderCount = [...template.matchAll(/\{port\}/g)].length

  if (placeholderCount !== 1) {
    invalid('Port argument template must contain exactly one {port} placeholder.')
  }

  const renderedTemplate = template.trim().replace('{port}', '12345')
  const tokens = renderedTemplate.split(/\s+/)
  if (
    renderedTemplate.length === 0 ||
    tokens.some((token) => !/^[A-Za-z0-9_./:=+,-]+$/.test(token))
  ) {
    invalid('Port argument template contains unsafe shell syntax.')
  }
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    invalid('Service port must be an integer between 1 and 65535.')
  }
}

function invalid(message: string): never {
  throw createExpectedAppError('TERMINAL_EXECUTION_CONFIG_INVALID', message)
}
