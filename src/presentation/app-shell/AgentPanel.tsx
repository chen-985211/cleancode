import { Bot } from 'lucide-react'

export function AgentPanel() {
  return (
    <aside className="agent-panel" aria-label="Agent 面板">
      <div className="agent-panel__body">
        <div className="agent-panel__summary">
          <span className="agent-panel__icon">
            <Bot size={17} aria-hidden="true" />
          </span>
          <strong>本地 Agent</strong>
          <span className="agent-panel__status">
            <span className="status-dot" />
            未接入
          </span>
        </div>
        <div className="agent-message agent-message--muted">本地 Agent 未接入。</div>
      </div>
    </aside>
  )
}
