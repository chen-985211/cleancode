import { useState, type ReactNode } from 'react'
import { Check, CircleAlert, Copy, Download, Loader2, MonitorOff, RefreshCw } from 'lucide-react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { CodexCliInstallationSnapshot } from '../../contexts/agent/application/ports/CodexCliPort'
import type { CodexCliPanelState } from './useCodexCliState'

export function CodexCliStatusView({
  onNewConversation,
  onRetryInspection,
  onRetryRestore,
  state,
  sessionStatus
}: {
  readonly onNewConversation?: () => void
  readonly onRetryInspection: () => void
  readonly onRetryRestore?: () => void
  readonly state: CodexCliPanelState
  readonly sessionStatus: AgentSessionSnapshot['status'] | null
}) {
  if (sessionStatus === 'running' || sessionStatus === 'suspended') return null

  if (sessionStatus === 'restore_failed') {
    return (
      <RuntimeNotice label="无法恢复上次对话" tone="warning">
        <span className="agent-runtime-notice__actions">
          <button type="button" onClick={onRetryRestore}>
            重试
          </button>
          <button type="button" onClick={onNewConversation}>
            新对话
          </button>
        </span>
      </RuntimeNotice>
    )
  }

  if (sessionStatus === 'exited') {
    return <RuntimeNotice label="Codex 会话已结束" tone="neutral" />
  }

  if (sessionStatus === 'failed') {
    if (state.status === 'ready' && state.installation.status === 'missing') {
      return (
        <MissingCliNotice
          installation={state.installation}
          label="Codex 会话启动失败，未检测到 CLI"
          onRetry={onRetryInspection}
        />
      )
    }

    return <RuntimeNotice label="Codex 会话启动失败" tone="warning" />
  }

  if (state.status === 'unavailable') {
    return <RuntimeNotice label="桌面运行时未连接" tone="neutral" icon="offline" />
  }

  if (state.status === 'checking') {
    return state.visible ? (
      <RuntimeNotice label="正在检查 Codex CLI" tone="neutral" icon="checking" />
    ) : null
  }

  if (state.installation.status === 'temporarily_unavailable') {
    return (
      <RuntimeNotice label="暂时无法检查 Codex CLI" tone="neutral">
        <span className="agent-runtime-notice__actions">
          <RetryInspectionButton onRetry={onRetryInspection} />
        </span>
      </RuntimeNotice>
    )
  }

  if (state.installation.status === 'missing') {
    return <MissingCliNotice installation={state.installation} onRetry={onRetryInspection} />
  }

  return null
}

function MissingCliNotice({
  installation,
  label = '未检测到 Codex CLI',
  onRetry
}: {
  readonly installation: Extract<CodexCliInstallationSnapshot, { readonly status: 'missing' }>
  readonly label?: string
  readonly onRetry: () => void
}) {
  const [isHelpVisible, setIsHelpVisible] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const copyInstallCommand = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) return
      await navigator.clipboard.writeText(installation.installCommand)
      setIsCopied(true)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <div className="agent-runtime-notice" role="status" data-tone="warning">
      <Download size={14} aria-hidden="true" />
      <span>{label}</span>
      <span className="agent-runtime-notice__actions">
        <RetryInspectionButton onRetry={onRetry} />
        <button
          type="button"
          aria-expanded={isHelpVisible}
          onClick={() => setIsHelpVisible((visible) => !visible)}
        >
          安装帮助
        </button>
      </span>
      {isHelpVisible ? (
        <span className="agent-runtime-notice__install-help">
          <code>{installation.installCommand}</code>
          <button type="button" aria-label="复制安装命令" onClick={() => void copyInstallCommand()}>
            {isCopied ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
            <span>{isCopied ? '已复制' : '复制'}</span>
          </button>
        </span>
      ) : null}
    </div>
  )
}

function RetryInspectionButton({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <button type="button" aria-label="重新检查 Codex CLI" onClick={onRetry}>
      <RefreshCw size={12} aria-hidden="true" />
      <span>重新检查</span>
    </button>
  )
}

function RuntimeNotice({
  children,
  icon = 'alert',
  label,
  tone
}: {
  readonly children?: ReactNode
  readonly icon?: 'alert' | 'checking' | 'offline'
  readonly label: string
  readonly tone: 'neutral' | 'warning'
}) {
  const Icon = icon === 'checking' ? Loader2 : icon === 'offline' ? MonitorOff : CircleAlert

  return (
    <div
      className={`agent-runtime-notice${icon === 'checking' ? ' agent-runtime-notice--checking' : ''}`}
      role="status"
      data-tone={tone}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
      {children}
    </div>
  )
}
