import { Copy, ExternalLink, LocateFixed, Pencil, TriangleAlert, X } from 'lucide-react'

import type {
  ManagedTerminalServiceOwner,
  TerminalRunIdentity,
  TerminalServiceEndpoint,
  TerminalServicePortConflict
} from './types'

interface TerminalServiceRuntimeBarProps {
  readonly identity: TerminalRunIdentity | null
  readonly endpoint: TerminalServiceEndpoint | null
  readonly portState: 'bound' | 'releasing' | 'quarantined' | null
  readonly conflict: TerminalServicePortConflict | null
  readonly onCopyEndpoint: (endpoint: TerminalServiceEndpoint) => Promise<void> | void
  readonly onOpenEndpoint: (identity: TerminalRunIdentity) => Promise<void> | void
  readonly onLocateOwner: (owner: ManagedTerminalServiceOwner) => Promise<void> | void
  readonly onEditPortConfiguration: () => void
  readonly onDismissConflict: () => void
}

export function TerminalServiceRuntimeBar({
  identity,
  endpoint,
  portState,
  conflict,
  onCopyEndpoint,
  onOpenEndpoint,
  onLocateOwner,
  onEditPortConfiguration,
  onDismissConflict
}: TerminalServiceRuntimeBarProps) {
  if (!endpoint && !conflict) return null

  return (
    <div className="terminal-service-runtime nodrag">
      {endpoint ? (
        <EndpointRow
          identity={identity}
          endpoint={endpoint}
          portState={portState}
          onCopyEndpoint={onCopyEndpoint}
          onOpenEndpoint={onOpenEndpoint}
        />
      ) : null}
      {conflict ? (
        <ConflictRow
          conflict={conflict}
          onOpenEndpoint={onOpenEndpoint}
          onLocateOwner={onLocateOwner}
          onEditPortConfiguration={onEditPortConfiguration}
          onDismissConflict={onDismissConflict}
        />
      ) : null}
    </div>
  )
}

function EndpointRow({
  identity,
  endpoint,
  portState,
  onCopyEndpoint,
  onOpenEndpoint
}: Pick<
  TerminalServiceRuntimeBarProps,
  'identity' | 'endpoint' | 'portState' | 'onCopyEndpoint' | 'onOpenEndpoint'
> & {
  readonly endpoint: TerminalServiceEndpoint
}) {
  const canOpen =
    Boolean(identity) &&
    portState === 'bound' &&
    endpoint.openable &&
    (endpoint.protocol === 'http' || endpoint.protocol === 'https')

  return (
    <div className="terminal-service-runtime__endpoint">
      <span className="terminal-service-runtime__label">服务</span>
      <code
        className="terminal-service-runtime__address"
        aria-label="实际服务地址"
        title={endpoint.displayAddress}
      >
        {endpoint.displayAddress}
      </code>
      {endpoint.fallback && endpoint.requestedPort !== null ? (
        <span className="terminal-service-runtime__fallback">
          首选 {endpoint.requestedPort} 已占用，已改用 {endpoint.port}
        </span>
      ) : null}
      {portState === 'releasing' ? (
        <span className="terminal-service-runtime__fallback">正在停止并释放端口</span>
      ) : null}
      {portState === 'quarantined' ? (
        <span className="terminal-service-runtime__fallback">端口清理未确认，已隔离</span>
      ) : null}
      <div className="terminal-service-runtime__actions">
        <RuntimeIconButton
          label="复制实际服务地址"
          tooltip="复制实际服务地址"
          onClick={() => void onCopyEndpoint(endpoint)}
        >
          <Copy size={13} aria-hidden="true" />
        </RuntimeIconButton>
        {canOpen && identity ? (
          <RuntimeIconButton
            label="打开实际服务地址"
            tooltip="打开实际服务地址"
            onClick={() => void onOpenEndpoint(identity)}
          >
            <ExternalLink size={13} aria-hidden="true" />
          </RuntimeIconButton>
        ) : null}
      </div>
    </div>
  )
}

function ConflictRow({
  conflict,
  onOpenEndpoint,
  onLocateOwner,
  onEditPortConfiguration,
  onDismissConflict
}: Pick<
  TerminalServiceRuntimeBarProps,
  'conflict' | 'onOpenEndpoint' | 'onLocateOwner' | 'onEditPortConfiguration' | 'onDismissConflict'
> & { readonly conflict: TerminalServicePortConflict }) {
  const owner = conflict.ownership === 'managed' ? conflict.managedOwner : null
  const canOpenOwner = owner && conflict.managedLeaseState === 'bound'

  return (
    <div className="terminal-service-runtime__conflict" role="status" aria-label="端口冲突">
      <TriangleAlert size={14} aria-hidden="true" />
      <span className="terminal-service-runtime__conflict-message">
        {createConflictMessage(conflict, owner)}
      </span>
      <div className="terminal-service-runtime__actions">
        {owner ? (
          <>
            <RuntimeIconButton
              label="定位占用服务"
              tooltip="定位占用服务"
              onClick={() => void onLocateOwner(owner)}
            >
              <LocateFixed size={13} aria-hidden="true" />
            </RuntimeIconButton>
            {canOpenOwner ? (
              <RuntimeIconButton
                label="打开占用服务"
                tooltip="打开占用服务"
                onClick={() => void onOpenEndpoint(owner.identity)}
              >
                <ExternalLink size={13} aria-hidden="true" />
              </RuntimeIconButton>
            ) : null}
          </>
        ) : null}
        <RuntimeIconButton
          label="编辑端口配置"
          tooltip="编辑端口配置"
          onClick={onEditPortConfiguration}
        >
          <Pencil size={13} aria-hidden="true" />
        </RuntimeIconButton>
        <RuntimeIconButton label="取消端口冲突提示" tooltip="关闭提示" onClick={onDismissConflict}>
          <X size={13} aria-hidden="true" />
        </RuntimeIconButton>
      </div>
    </div>
  )
}

function createConflictMessage(
  conflict: TerminalServicePortConflict,
  owner: ManagedTerminalServiceOwner | null
): string {
  if (owner) {
    if (conflict.managedLeaseState === 'releasing') {
      return `端口 ${conflict.port} 的服务正在停止并清理`
    }
    if (conflict.managedLeaseState === 'quarantined') {
      return `端口 ${conflict.port} 的上次清理未确认，当前已隔离`
    }
    if (conflict.managedLeaseState === 'reserved' || conflict.managedLeaseState === 'activating') {
      return `端口 ${conflict.port} 正由 ${owner.projectName} / ${owner.workspaceName} / ${owner.terminalName} 启动`
    }
    return `端口 ${conflict.port} 正由 ${owner.projectName} / ${owner.workspaceName} / ${owner.terminalName} 使用`
  }

  if (conflict.code === 'SERVICE_PORT_ALLOCATION_EXHAUSTED') {
    return '未能分配可用端口，请修改端口配置后重试'
  }

  if (conflict.ownership === 'managed') {
    return `端口 ${conflict.port} 正由另一个 cleancode 服务使用`
  }

  return conflict.ownership === 'external'
    ? `端口 ${conflict.port} 已被外部服务占用`
    : `无法确认端口 ${conflict.port} 的监听者归属`
}

function RuntimeIconButton({
  label,
  tooltip,
  onClick,
  children
}: {
  readonly label: string
  readonly tooltip: string
  readonly onClick: () => void
  readonly children: React.ReactNode
}) {
  return (
    <button
      className="terminal-service-runtime__action"
      type="button"
      aria-label={label}
      title={tooltip}
      data-cc-tooltip={tooltip}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
