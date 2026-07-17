import {
  Box,
  LoaderCircle,
  MapPin,
  ShieldAlert,
  Terminal,
  TriangleAlert,
  Waypoints
} from 'lucide-react'

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
  const phase = presentation.approval.phase
  const isApproving = phase === 'approving'
  const isFailed = phase === 'failed'
  const isMissing = presentation.status === 'missing'
  const actionCopy = createActionCopy(presentation.targetKind, isApproving)
  const statusLabel = isMissing
    ? '目标不可用'
    : isFailed
      ? '操作未完成'
      : isApproving
        ? '正在执行'
        : '需要你的确认'

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
        <span className="agent-tool-approval-card__status-icon" aria-hidden="true">
          <ShieldAlert size={18} />
        </span>
        <div className="agent-tool-approval-card__heading">
          <span className="agent-tool-approval-card__eyebrow">{statusLabel}</span>
          <h3>{actionCopy.heading}</h3>
        </div>
        {queueCount > 0 ? (
          <span
            className="agent-tool-approval-card__queue"
            aria-label={`当前第 1 个，共 ${queueCount + 1} 个审批请求`}
          >
            1 / {queueCount + 1}
          </span>
        ) : null}
      </header>

      <div className="agent-tool-approval-card__body">
        {isMissing ? (
          <div className="agent-tool-approval-card__notice" role="status">
            <TriangleAlert size={15} aria-hidden="true" />
            <span>
              目标已不在当前画布中
              <code title={presentation.targetId}>ID {shortenId(presentation.targetId)}</code>
            </span>
          </div>
        ) : (
          <TargetDetails
            presentation={presentation}
            isLocatingDisabled={isApproving}
            onLocate={onLocate}
          />
        )}

        {isFailed ? (
          <div className="agent-tool-approval-card__error" role="alert">
            <TriangleAlert size={15} aria-hidden="true" />
            <span>{presentation.approval.errorMessage ?? '操作未完成。AI 可重新发起请求。'}</span>
          </div>
        ) : (
          <p className="agent-tool-approval-card__impact">
            <span className="agent-tool-approval-card__impact-icon" aria-hidden="true">
              <TriangleAlert size={14} />
            </span>
            <span>{createImpact(presentation)}</span>
          </p>
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
              className="agent-tool-approval-card__button"
              type="button"
              disabled={isApproving}
              onClick={onReject}
            >
              {actionCopy.retainLabel}
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
              {actionCopy.destructiveLabel}
            </button>
          </>
        )}
      </footer>
    </section>
  )
}

interface TargetDetailsProps {
  readonly isLocatingDisabled: boolean
  readonly onLocate: () => void
  readonly presentation: AgentApprovalPresentation
}

function TargetDetails({ isLocatingDisabled, onLocate, presentation }: TargetDetailsProps) {
  if (presentation.status === 'missing') return null

  if (presentation.targetKind === 'terminal') {
    return (
      <div
        className="agent-tool-approval-card__target"
        role="group"
        aria-label={`审批目标 ${presentation.block.name}`}
      >
        <span className="agent-tool-approval-card__object-icon" aria-hidden="true">
          <Terminal size={18} />
        </span>
        <div className="agent-tool-approval-card__target-copy">
          <span className="agent-tool-approval-card__target-type">目标终端</span>
          <strong>{presentation.block.name}</strong>
          <span className="agent-tool-approval-card__description">
            {presentation.block.description || '未填写终端说明'}
          </span>
          <div className="agent-tool-approval-card__target-meta">
            <code title={presentation.block.id}>ID {shortenId(presentation.block.id)}</code>
            {presentation.containingGroup ? (
              <span className="agent-tool-approval-card__membership">
                位于组合「{presentation.containingGroup.name}」
              </span>
            ) : null}
          </div>
        </div>
        <LocateTargetButton
          disabled={isLocatingDisabled}
          name={presentation.block.name}
          onLocate={onLocate}
        />
      </div>
    )
  }

  if (presentation.targetKind === 'connection') {
    const locateName = `${presentation.sourceBlock.name} 到 ${presentation.targetBlock.name}`

    return (
      <div
        className="agent-tool-approval-card__target agent-tool-approval-card__target--connection"
        role="group"
        aria-label={`审批目标 ${locateName}`}
      >
        <span className="agent-tool-approval-card__object-icon" aria-hidden="true">
          <Waypoints size={18} />
        </span>
        <div className="agent-tool-approval-card__target-copy">
          <span className="agent-tool-approval-card__target-type">目标依赖</span>
          <div className="agent-tool-approval-card__connection-endpoints">
            <ConnectionEndpoint
              direction="上游终端"
              id={presentation.sourceBlock.id}
              name={presentation.sourceBlock.name}
            />
            <span className="agent-tool-approval-card__connection-arrow" aria-hidden="true">
              →
            </span>
            <ConnectionEndpoint
              direction="下游终端"
              id={presentation.targetBlock.id}
              name={presentation.targetBlock.name}
            />
          </div>
          <div className="agent-tool-approval-card__target-meta">
            <code
              aria-label={`连接 ID ${presentation.connection.id}`}
              tabIndex={0}
              title={presentation.connection.id}
            >
              连接 ID {presentation.connection.id}
            </code>
          </div>
        </div>
        <LocateTargetButton disabled={isLocatingDisabled} name={locateName} onLocate={onLocate} />
      </div>
    )
  }

  return (
    <div
      className="agent-tool-approval-card__target"
      role="group"
      aria-label={`审批目标 ${presentation.group.name}`}
    >
      <span className="agent-tool-approval-card__object-icon" aria-hidden="true">
        <Box size={18} />
      </span>
      <div className="agent-tool-approval-card__target-copy">
        <span className="agent-tool-approval-card__target-type">目标组合</span>
        <strong>{presentation.group.name}</strong>
        <span className="agent-tool-approval-card__description">
          {presentation.memberBlocks.length} 个终端：
          {presentation.memberBlocks.map((block) => block.name).join('、') || '无成员'}
        </span>
        <div className="agent-tool-approval-card__target-meta">
          <code title={presentation.group.id}>ID {shortenId(presentation.group.id)}</code>
        </div>
      </div>
      <LocateTargetButton
        disabled={isLocatingDisabled}
        name={presentation.group.name}
        onLocate={onLocate}
      />
    </div>
  )
}

interface ConnectionEndpointProps {
  readonly direction: '上游终端' | '下游终端'
  readonly id: string
  readonly name: string
}

function ConnectionEndpoint({ direction, id, name }: ConnectionEndpointProps) {
  return (
    <span className="agent-tool-approval-card__connection-endpoint">
      <span className="agent-tool-approval-card__target-type">{direction}</span>
      <strong>{name}</strong>
      <code title={id}>ID {shortenId(id)}</code>
    </span>
  )
}

interface LocateTargetButtonProps {
  readonly disabled: boolean
  readonly name: string
  readonly onLocate: () => void
}

function LocateTargetButton({ disabled, name, onLocate }: LocateTargetButtonProps) {
  return (
    <button
      className="agent-tool-approval-card__locate"
      type="button"
      aria-label={`在画布中查看 ${name}`}
      disabled={disabled}
      onClick={onLocate}
    >
      <MapPin size={14} aria-hidden="true" />
      在画布查看
    </button>
  )
}

function createImpact(presentation: AgentApprovalPresentation): string {
  if (presentation.status === 'missing') {
    return '为避免误操作，请保留目标并让 AI 重新检查画布。'
  }

  if (presentation.targetKind === 'terminal') {
    return '从画布删除此终端及相关连线；所在组合可能因成员不足自动解散。'
  }

  if (presentation.targetKind === 'connection') {
    return '只断开这条依赖，保留两端终端、启动命令、执行配置和组合。'
  }

  return '只解散组合，保留其中终端及现有连线。'
}

function createActionCopy(
  targetKind: AgentApprovalPresentation['targetKind'],
  isApproving: boolean
): {
  readonly destructiveLabel: string
  readonly heading: string
  readonly retainLabel: string
} {
  if (targetKind === 'terminal') {
    return {
      destructiveLabel: isApproving ? '正在删除…' : '确认删除',
      heading: '删除终端',
      retainLabel: '保留终端'
    }
  }

  if (targetKind === 'connection') {
    return {
      destructiveLabel: isApproving ? '正在断开…' : '确认断开',
      heading: '断开终端依赖',
      retainLabel: '保留依赖'
    }
  }

  return {
    destructiveLabel: isApproving ? '正在解散…' : '确认解散',
    heading: '解散终端组合',
    retainLabel: '保留组合'
  }
}

function shortenId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}
