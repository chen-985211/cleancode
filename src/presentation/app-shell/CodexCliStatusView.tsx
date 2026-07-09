import { CheckCircle2, Download, Loader2, Terminal } from 'lucide-react'

import type { CodexCliInstallationSnapshot } from '../../contexts/agent/application/ports/CodexCliPort'

export type CodexCliPanelState =
  | { readonly status: 'unavailable' }
  | { readonly status: 'checking' }
  | { readonly status: 'ready'; readonly installation: CodexCliInstallationSnapshot }

export function CodexCliStatusView({ state }: { readonly state: CodexCliPanelState }) {
  if (state.status === 'unavailable') {
    return (
      <div className="agent-runtime-card agent-runtime-card--muted" aria-live="polite">
        <span className="agent-runtime-card__icon">
          <Terminal size={15} aria-hidden="true" />
        </span>
        <div className="agent-runtime-card__content">
          <span>Codex CLI</span>
          <code>桌面运行时未连接。</code>
        </div>
      </div>
    )
  }

  if (state.status === 'checking') {
    return (
      <div className="agent-runtime-card agent-runtime-card--checking" aria-live="polite">
        <span className="agent-runtime-card__icon">
          <Loader2 size={15} aria-hidden="true" />
        </span>
        <div className="agent-runtime-card__content">
          <span>Codex CLI</span>
          <code>正在检查</code>
        </div>
      </div>
    )
  }

  if (state.installation.status === 'installed') {
    return (
      <div className="agent-runtime-card agent-runtime-card--installed" aria-live="polite">
        <span className="agent-runtime-card__icon">
          <Terminal size={15} aria-hidden="true" />
        </span>
        <div className="agent-runtime-card__content">
          <span>Codex CLI</span>
          <code title={state.installation.version ?? undefined}>{state.installation.version}</code>
        </div>
        <strong>
          <CheckCircle2 size={13} aria-hidden="true" />
          已安装
        </strong>
      </div>
    )
  }

  return (
    <div className="agent-runtime-card agent-runtime-card--missing" aria-live="polite">
      <span className="agent-runtime-card__icon">
        <Download size={15} aria-hidden="true" />
      </span>
      <div className="agent-runtime-card__content">
        <span>Codex CLI</span>
        <code title={state.installation.installCommand}>{state.installation.installCommand}</code>
      </div>
      <strong>未安装</strong>
    </div>
  )
}
