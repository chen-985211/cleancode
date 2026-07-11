import { CircleAlert, Download, Loader2, MonitorOff } from 'lucide-react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { CodexCliInstallationSnapshot } from '../../contexts/agent/application/ports/CodexCliPort'

export type CodexCliPanelState =
  | { readonly status: 'unavailable' }
  | { readonly status: 'checking' }
  | { readonly status: 'ready'; readonly installation: CodexCliInstallationSnapshot }

export function CodexCliStatusView({
  state,
  sessionStatus
}: {
  readonly state: CodexCliPanelState
  readonly sessionStatus: AgentSessionSnapshot['status'] | null
}) {
  if (state.status === 'unavailable') {
    return (
      <div className="agent-runtime-notice" role="status" data-tone="neutral">
        <MonitorOff size={14} aria-hidden="true" />
        <span>桌面运行时未连接</span>
      </div>
    )
  }

  if (state.status === 'checking') {
    return (
      <div className="agent-runtime-notice agent-runtime-notice--checking" role="status">
        <Loader2 size={14} aria-hidden="true" />
        <span>正在检查 Codex CLI</span>
      </div>
    )
  }

  if (state.installation.status !== 'installed') {
    return (
      <div className="agent-runtime-notice" role="status" data-tone="warning">
        <Download size={14} aria-hidden="true" />
        <span>未检测到 Codex CLI</span>
        <code title={state.installation.installCommand}>{state.installation.installCommand}</code>
      </div>
    )
  }

  if (sessionStatus === 'failed') {
    return (
      <div className="agent-runtime-notice" role="status" data-tone="warning">
        <CircleAlert size={14} aria-hidden="true" />
        <span>Codex 会话启动失败</span>
      </div>
    )
  }

  if (sessionStatus === 'exited') {
    return (
      <div className="agent-runtime-notice" role="status" data-tone="neutral">
        <CircleAlert size={14} aria-hidden="true" />
        <span>Codex 会话已结束</span>
      </div>
    )
  }

  return null
}
