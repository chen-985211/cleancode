import type { TerminalExecutionConfigSnapshot } from '../../application/dto/BlockGraphSnapshot'
import { translate, type Translate } from '../../../../presentation/i18n/messages'

type TerminalServicePortPolicy = NonNullable<
  Extract<TerminalExecutionConfigSnapshot, { mode: 'service' }>['port']
>['policy']

export interface ExecutionConfigDraft {
  readonly mode: 'task' | 'service'
  readonly successExitCodes: string
  readonly taskTimeoutSeconds: string
  readonly readinessType: 'output' | 'tcp'
  readonly readinessText: string
  readonly readinessTimeoutSeconds: string
  readonly portPolicy: 'unmanaged' | 'fixed' | 'preferred' | 'auto'
  readonly portProtocol: 'http' | 'https' | 'tcp'
  readonly portNumber: string
  readonly portBinding: 'none' | 'environment' | 'argument'
  readonly environmentVariable: string
  readonly argumentTemplate: string
}

export interface ExecutionConfigDraftValidation {
  readonly config: TerminalExecutionConfigSnapshot | null
  readonly error: string | null
}

export function createExecutionConfigDraft(
  config: TerminalExecutionConfigSnapshot
): ExecutionConfigDraft {
  const port = config.mode === 'service' ? config.port : undefined

  return {
    mode: config.mode,
    successExitCodes: config.mode === 'task' ? config.successExitCodes.join(',') : '0',
    taskTimeoutSeconds:
      config.mode === 'task' && config.timeoutMs !== null ? String(config.timeoutMs / 1_000) : '',
    readinessType: config.mode === 'service' ? config.readiness.type : 'output',
    readinessText:
      config.mode === 'service' && config.readiness.type === 'output'
        ? config.readiness.text
        : 'ready',
    readinessTimeoutSeconds:
      config.mode === 'service' ? String(config.readinessTimeoutMs / 1_000) : '30',
    portPolicy: port?.policy.type ?? 'unmanaged',
    portProtocol: port?.protocol ?? 'http',
    portNumber:
      port?.policy.type === 'fixed' || port?.policy.type === 'preferred'
        ? String(port.policy.port)
        : '',
    portBinding: port?.binding.type ?? 'environment',
    environmentVariable: port?.binding.type === 'environment' ? port.binding.variableName : '',
    argumentTemplate: port?.binding.type === 'argument' ? port.binding.template : '--port {port}'
  }
}

export function validateExecutionConfigDraft(
  draft: ExecutionConfigDraft,
  t: Translate = defaultTranslate
): ExecutionConfigDraftValidation {
  if (draft.mode === 'task') {
    return validateTaskExecutionConfig(draft, t)
  }

  return validateServiceExecutionConfig(draft, t)
}

function validateTaskExecutionConfig(
  draft: ExecutionConfigDraft,
  t: Translate
): ExecutionConfigDraftValidation {
  const successExitCodes = draft.successExitCodes.split(',').map((value) => Number(value.trim()))
  const timeoutMs = draft.taskTimeoutSeconds.trim()
    ? parsePositiveSeconds(draft.taskTimeoutSeconds)
    : null

  if (
    successExitCodes.length === 0 ||
    successExitCodes.some((code) => !Number.isInteger(code) || code < 0 || code > 255)
  ) {
    return invalid(t('terminalValidation.exitCodes'))
  }

  if (draft.taskTimeoutSeconds.trim() && timeoutMs === null) {
    return invalid(t('terminalValidation.taskTimeout'))
  }

  return valid({
    mode: 'task',
    successExitCodes: [...new Set(successExitCodes)],
    timeoutMs
  })
}

function validateServiceExecutionConfig(
  draft: ExecutionConfigDraft,
  t: Translate
): ExecutionConfigDraftValidation {
  const readinessTimeoutMs = parsePositiveSeconds(draft.readinessTimeoutSeconds)

  if (readinessTimeoutMs === null) {
    return invalid(t('terminalValidation.readinessTimeout'))
  }

  const readiness =
    draft.readinessType === 'output'
      ? draft.readinessText.trim()
        ? ({ type: 'output', text: draft.readinessText.trim() } as const)
        : null
      : ({ type: 'tcp' } as const)

  if (!readiness) {
    return invalid(t('terminalValidation.readinessText'))
  }

  if (draft.portPolicy === 'unmanaged') {
    return readiness.type === 'tcp'
      ? invalid(t('terminalValidation.tcpNeedsPort'))
      : valid({ mode: 'service', readiness, readinessTimeoutMs })
  }

  const policy = parsePortPolicy(draft)
  if (!policy) {
    return invalid(t('terminalValidation.portRange'))
  }

  if (draft.portBinding === 'none' && policy.type !== 'fixed') {
    return invalid(t('terminalValidation.noBindingFixedOnly'))
  }

  const binding = parsePortBinding(draft)
  if (!binding) {
    return invalid(
      draft.portBinding === 'environment'
        ? t('terminalValidation.environmentVariable')
        : t('terminalValidation.argumentTemplate')
    )
  }

  return valid({
    mode: 'service',
    readiness,
    readinessTimeoutMs,
    port: { protocol: draft.portProtocol, policy, binding }
  })
}

function parsePortPolicy(draft: ExecutionConfigDraft): TerminalServicePortPolicy | null {
  if (draft.portPolicy === 'auto') return { type: 'auto' } as const

  if (draft.portPolicy !== 'fixed' && draft.portPolicy !== 'preferred') return null

  const port = Number(draft.portNumber)
  return Number.isInteger(port) && port > 0 && port <= 65_535
    ? ({ type: draft.portPolicy, port } as const)
    : null
}

function parsePortBinding(draft: ExecutionConfigDraft) {
  if (draft.portBinding === 'none') return { type: 'none' } as const

  if (draft.portBinding === 'environment') {
    const variableName = draft.environmentVariable.trim()
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(variableName)
      ? ({ type: 'environment', variableName } as const)
      : null
  }

  const template = draft.argumentTemplate.trim()
  const placeholders = template.match(/\{port\}/g) ?? []
  const remainingTemplate = template.replace('{port}', '')

  return placeholders.length === 1 && /^[A-Za-z0-9_./:=\- ]*$/.test(remainingTemplate)
    ? ({ type: 'argument', template } as const)
    : null
}

function parsePositiveSeconds(value: string): number | null {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1_000) : null
}

function valid(config: TerminalExecutionConfigSnapshot): ExecutionConfigDraftValidation {
  return { config, error: null }
}

function invalid(error: string): ExecutionConfigDraftValidation {
  return { config: null, error }
}

const defaultTranslate: Translate = (key, variables) => translate('zh-CN', key, variables)
