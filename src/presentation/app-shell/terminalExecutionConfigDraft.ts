import type { TerminalExecutionConfigSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

export interface ExecutionConfigDraft {
  readonly mode: 'task' | 'service'
  readonly successExitCodes: string
  readonly taskTimeoutSeconds: string
  readonly readinessType: 'output' | 'tcp'
  readonly readinessText: string
  readonly readinessPort: string
  readonly readinessTimeoutSeconds: string
}

export function createExecutionConfigDraft(
  config: TerminalExecutionConfigSnapshot
): ExecutionConfigDraft {
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
    readinessPort:
      config.mode === 'service' && config.readiness.type === 'tcp'
        ? String(config.readiness.port)
        : '3000',
    readinessTimeoutSeconds:
      config.mode === 'service' ? String(config.readinessTimeoutMs / 1_000) : '30'
  }
}

export function parseExecutionConfigDraft(
  draft: ExecutionConfigDraft
): TerminalExecutionConfigSnapshot | null {
  if (draft.mode === 'task') {
    const successExitCodes = draft.successExitCodes.split(',').map((value) => Number(value.trim()))
    const timeoutMs = draft.taskTimeoutSeconds.trim()
      ? parsePositiveSeconds(draft.taskTimeoutSeconds)
      : null

    if (
      successExitCodes.length === 0 ||
      successExitCodes.some((code) => !Number.isInteger(code) || code < 0 || code > 255) ||
      (draft.taskTimeoutSeconds.trim() && timeoutMs === null)
    ) {
      return null
    }

    return { mode: 'task', successExitCodes: [...new Set(successExitCodes)], timeoutMs }
  }

  const readinessTimeoutMs = parsePositiveSeconds(draft.readinessTimeoutSeconds)

  if (readinessTimeoutMs === null) return null
  if (draft.readinessType === 'output') {
    const text = draft.readinessText.trim()
    return text
      ? { mode: 'service', readiness: { type: 'output', text }, readinessTimeoutMs }
      : null
  }

  const port = Number(draft.readinessPort)
  return Number.isInteger(port) && port > 0 && port <= 65_535
    ? { mode: 'service', readiness: { type: 'tcp', port }, readinessTimeoutMs }
    : null
}

function parsePositiveSeconds(value: string): number | null {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1_000) : null
}
