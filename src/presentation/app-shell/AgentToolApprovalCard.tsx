import { Box, LoaderCircle, MapPin, ShieldAlert, Terminal, TriangleAlert } from 'lucide-react'

import type { AgentApprovalPresentation } from './agentApprovalPresentation'

interface AgentToolApprovalCardProps {
  readonly onApprove: () => void
  readonly onDismiss: () => void
  readonly onLocate: () => void
  readonly onReject: () => void
  readonly presentation: AgentApprovalPresentation
  readonly queueCount: number
}

export function AgentToolApprovalCard({
  onApprove,
  onDismiss,
  onLocate,
  onReject,
  presentation,
  queueCount
}: AgentToolApprovalCardProps) {
  const isTerminal = presentation.targetKind === 'terminal'
  const phase = presentation.approval.phase
  const isApproving = phase === 'approving'
  const isFailed = phase === 'failed'
  const isMissing = presentation.status === 'missing'
  const heading = isFailed
    ? isTerminal
      ? '终端未删除'
      : '组合未解散'
    : isTerminal
      ? '删除终端？'
      : '解散组合？'
  const destructiveLabel = isApproving
    ? isTerminal
      ? '删除中…'
      : '解散中…'
    : isTerminal
      ? '删除终端'
      : '解散组合'

  return (
    <section
      className={[
        'agent-tool-approval-card',
        `agent-tool-approval-card--${phase}`,
        isMissing ? 'agent-tool-approval-card--missing' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label="Agent 工具授权"
    >
      <header className="agent-tool-approval-card__header">
        <span className="agent-tool-approval-card__eyebrow">
          <ShieldAlert size={14} aria-hidden="true" />
          AI 操作审批
        </span>
        {queueCount > 0 ? (
          <span className="agent-tool-approval-card__queue">另有 {queueCount} 个请求等待处理</span>
        ) : null}
      </header>

      <div className="agent-tool-approval-card__body">
        <div className="agent-tool-approval-card__title-row">
          <span className="agent-tool-approval-card__object-icon" aria-hidden="true">
            {isTerminal ? <Terminal size={18} /> : <Box size={18} />}
          </span>
          <div>
            <h3>{heading}</h3>
            <p>{createLead(presentation)}</p>
          </div>
        </div>

        {isMissing ? (
          <div className="agent-tool-approval-card__notice" role="status">
            <TriangleAlert size={15} aria-hidden="true" />
            <span>目标已不在当前画布中</span>
            <code>{shortenId(presentation.targetId)}</code>
          </div>
        ) : (
          <TargetDetails presentation={presentation} />
        )}

        {isFailed ? (
          <div className="agent-tool-approval-card__error" role="alert">
            <TriangleAlert size={15} aria-hidden="true" />
            <span>{presentation.approval.errorMessage ?? '操作未完成。AI 可重新发起请求。'}</span>
          </div>
        ) : (
          <p className="agent-tool-approval-card__impact">{createImpact(presentation)}</p>
        )}
      </div>

      <footer className="agent-tool-approval-card__actions">
        {isFailed ? (
          <button className="agent-tool-approval-card__button" type="button" onClick={onDismiss}>
            关闭
          </button>
        ) : (
          <>
            <button
              className="agent-tool-approval-card__button agent-tool-approval-card__button--locate"
              type="button"
              aria-label={`在画布中查看 ${readTargetName(presentation)}`}
              disabled={isApproving || isMissing}
              onClick={onLocate}
            >
              <MapPin size={14} aria-hidden="true" />
              在画布中查看
            </button>
            <span className="agent-tool-approval-card__action-spacer" />
            <button
              className="agent-tool-approval-card__button"
              type="button"
              disabled={isApproving}
              onClick={onReject}
            >
              {isTerminal ? '保留终端' : '保留组合'}
            </button>
            <button
              className="agent-tool-approval-card__button agent-tool-approval-card__button--danger"
              type="button"
              disabled={isApproving || isMissing}
              onClick={onApprove}
            >
              {isApproving ? (
                <LoaderCircle
                  className="agent-tool-approval-card__spinner"
                  size={14}
                  aria-hidden="true"
                />
              ) : null}
              {destructiveLabel}
            </button>
          </>
        )}
      </footer>
    </section>
  )
}

function TargetDetails({ presentation }: { readonly presentation: AgentApprovalPresentation }) {
  if (presentation.status === 'missing') return null

  if (presentation.targetKind === 'terminal') {
    return (
      <div className="agent-tool-approval-card__target">
        <div className="agent-tool-approval-card__target-main">
          <strong>{presentation.block.name}</strong>
          <code>{shortenId(presentation.block.id)}</code>
        </div>
        <span>{presentation.block.description || '未填写终端说明'}</span>
        {presentation.containingGroup ? (
          <span className="agent-tool-approval-card__membership">
            位于组合「{presentation.containingGroup.name}」
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="agent-tool-approval-card__target">
      <div className="agent-tool-approval-card__target-main">
        <strong>{presentation.group.name}</strong>
        <code>{shortenId(presentation.group.id)}</code>
      </div>
      <span>
        {presentation.memberBlocks.length} 个终端：
        {presentation.memberBlocks.map((block) => block.name).join('、') || '无成员'}
      </span>
    </div>
  )
}

function createLead(presentation: AgentApprovalPresentation): string {
  if (presentation.status === 'missing') {
    return presentation.targetKind === 'terminal'
      ? 'AI 请求删除一个无法定位的终端。'
      : 'AI 请求解散一个无法定位的组合。'
  }

  return presentation.targetKind === 'terminal'
    ? `AI 想从画布删除「${presentation.block.name}」。`
    : `AI 想解散「${presentation.group.name}」。`
}

function createImpact(presentation: AgentApprovalPresentation): string {
  if (presentation.status === 'missing') {
    return '为避免误操作，请保留目标并让 AI 重新检查画布。'
  }

  return presentation.targetKind === 'terminal'
    ? '从画布删除此终端及相关连线；所在组合可能因成员不足自动解散。'
    : '只解散组合，保留其中终端及现有连线。'
}

function readTargetName(presentation: AgentApprovalPresentation): string {
  if (presentation.status === 'missing') return presentation.targetId
  return presentation.targetKind === 'terminal' ? presentation.block.name : presentation.group.name
}

function shortenId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}
