import type { TerminalExecutionConfigSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

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
  draft: ExecutionConfigDraft
): ExecutionConfigDraftValidation {
  if (draft.mode === 'task') {
    return validateTaskExecutionConfig(draft)
  }

  return validateServiceExecutionConfig(draft)
}

function validateTaskExecutionConfig(draft: ExecutionConfigDraft): ExecutionConfigDraftValidation {
  const successExitCodes = draft.successExitCodes.split(',').map((value) => Number(value.trim()))
  const timeoutMs = draft.taskTimeoutSeconds.trim()
    ? parsePositiveSeconds(draft.taskTimeoutSeconds)
    : null

  if (
    successExitCodes.length === 0 ||
    successExitCodes.some((code) => !Number.isInteger(code) || code < 0 || code > 255)
  ) {
    return invalid('成功退出码必须是 0 到 255 之间的整数。')
  }

  if (draft.taskTimeoutSeconds.trim() && timeoutMs === null) {
    return invalid('任务超时必须是大于 0 的秒数。')
  }

  return valid({
    mode: 'task',
    successExitCodes: [...new Set(successExitCodes)],
    timeoutMs
  })
}

function validateServiceExecutionConfig(
  draft: ExecutionConfigDraft
): ExecutionConfigDraftValidation {
  const readinessTimeoutMs = parsePositiveSeconds(draft.readinessTimeoutSeconds)

  if (readinessTimeoutMs === null) {
    return invalid('服务就绪超时必须是大于 0 的秒数。')
  }

  const readiness =
    draft.readinessType === 'output'
      ? draft.readinessText.trim()
        ? ({ type: 'output', text: draft.readinessText.trim() } as const)
        : null
      : ({ type: 'tcp' } as const)

  if (!readiness) {
    return invalid('请填写服务就绪文本。')
  }

  if (draft.portPolicy === 'unmanaged') {
    return readiness.type === 'tcp'
      ? invalid('TCP 就绪需要先配置端口策略。')
      : valid({ mode: 'service', readiness, readinessTimeoutMs })
  }

  const policy = parsePortPolicy(draft)
  if (!policy) {
    return invalid('服务端口必须是 1 到 65535 之间的整数。')
  }

  if (draft.portBinding === 'none' && policy.type !== 'fixed') {
    return invalid('不注入端口只适用于固定端口策略。')
  }

  const binding = parsePortBinding(draft)
  if (!binding) {
    return invalid(
      draft.portBinding === 'environment'
        ? '请填写有效的环境变量名称。'
        : '参数后缀必须只包含安全参数，并且恰好包含一个 {port}。'
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
