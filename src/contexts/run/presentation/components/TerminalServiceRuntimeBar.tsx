import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy'
import { CrosshairIcon } from '@phosphor-icons/react/dist/csr/Crosshair'
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react'

import type {
  ManagedTerminalServiceOwner,
  TerminalRunIdentity,
  TerminalServiceEndpoint,
  TerminalServicePortConflict
} from '../../application/dto/TerminalRunEvent'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import type { Translate } from '../../../../presentation/i18n/messages'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'

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
  const { t } = useI18n()
  const canOpen =
    Boolean(identity) &&
    portState === 'bound' &&
    endpoint.openable &&
    (endpoint.protocol === 'http' || endpoint.protocol === 'https')

  return (
    <div className="terminal-service-runtime__endpoint">
      <span className="terminal-service-runtime__label">{t('service.label')}</span>
      <TooltipLabel content={endpoint.displayAddress}>
        <code className="terminal-service-runtime__address" aria-label={t('service.actualAddress')}>
          {endpoint.displayAddress}
        </code>
      </TooltipLabel>
      {endpoint.fallback && endpoint.requestedPort !== null ? (
        <span className="terminal-service-runtime__fallback">
          {t('service.fallback', {
            requestedPort: endpoint.requestedPort,
            port: endpoint.port
          })}
        </span>
      ) : null}
      {portState === 'releasing' ? (
        <span className="terminal-service-runtime__fallback">{t('service.releasing')}</span>
      ) : null}
      {portState === 'quarantined' ? (
        <span className="terminal-service-runtime__fallback">{t('service.quarantined')}</span>
      ) : null}
      <div className="terminal-service-runtime__actions">
        <RuntimeIconButton
          label={t('service.copyAddress')}
          tooltip={t('service.copyAddress')}
          onClick={() => void onCopyEndpoint(endpoint)}
        >
          <TerminalServiceRuntimeIcon role="copy" size={13} />
        </RuntimeIconButton>
        {canOpen && identity ? (
          <RuntimeIconButton
            label={t('service.openAddress')}
            tooltip={t('service.openAddress')}
            onClick={() => void onOpenEndpoint(identity)}
          >
            <TerminalServiceRuntimeIcon role="open-external" size={13} />
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
  const { t } = useI18n()
  const owner = conflict.ownership === 'managed' ? conflict.managedOwner : null
  const canOpenOwner = owner && conflict.managedLeaseState === 'bound'

  return (
    <div
      className="terminal-service-runtime__conflict"
      role="status"
      aria-label={t('service.portConflict')}
    >
      <TerminalServiceRuntimeIcon role="warning" size={14} />
      <span className="terminal-service-runtime__conflict-message">
        {createConflictMessage(conflict, owner, t)}
      </span>
      <div className="terminal-service-runtime__actions">
        {owner ? (
          <>
            <RuntimeIconButton
              label={t('service.locateOwner')}
              tooltip={t('service.locateOwner')}
              onClick={() => void onLocateOwner(owner)}
            >
              <TerminalServiceRuntimeIcon role="locate" size={13} />
            </RuntimeIconButton>
            {canOpenOwner ? (
              <RuntimeIconButton
                label={t('service.openOwner')}
                tooltip={t('service.openOwner')}
                onClick={() => void onOpenEndpoint(owner.identity)}
              >
                <TerminalServiceRuntimeIcon role="open-external" size={13} />
              </RuntimeIconButton>
            ) : null}
          </>
        ) : null}
        <RuntimeIconButton
          label={t('service.editPort')}
          tooltip={t('service.editPort')}
          onClick={onEditPortConfiguration}
        >
          <TerminalServiceRuntimeIcon role="edit" size={13} />
        </RuntimeIconButton>
        <RuntimeIconButton
          label={t('service.dismissConflict')}
          tooltip={t('service.dismiss')}
          onClick={onDismissConflict}
        >
          <TerminalServiceRuntimeIcon role="close" size={13} />
        </RuntimeIconButton>
      </div>
    </div>
  )
}

function createConflictMessage(
  conflict: TerminalServicePortConflict,
  owner: ManagedTerminalServiceOwner | null,
  t: Translate
): string {
  if (owner) {
    if (conflict.managedLeaseState === 'releasing') {
      return t('service.conflictReleasing', { port: conflict.port })
    }
    if (conflict.managedLeaseState === 'quarantined') {
      return t('service.conflictQuarantined', { port: conflict.port })
    }
    if (conflict.managedLeaseState === 'reserved' || conflict.managedLeaseState === 'activating') {
      return t('service.conflictStarting', {
        port: conflict.port,
        projectName: owner.projectName,
        workspaceName: owner.workspaceDisplayName,
        terminalName: owner.terminalName
      })
    }
    return t('service.conflictManaged', {
      port: conflict.port,
      projectName: owner.projectName,
      workspaceName: owner.workspaceDisplayName,
      terminalName: owner.terminalName
    })
  }

  if (conflict.code === 'SERVICE_PORT_ALLOCATION_EXHAUSTED') {
    return t('service.conflictExhausted')
  }

  if (conflict.ownership === 'managed') {
    return t('service.conflictOtherManaged', { port: conflict.port })
  }

  return conflict.ownership === 'external'
    ? t('service.conflictExternal', { port: conflict.port })
    : t('service.conflictUnknown', { port: conflict.port })
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
    <TooltipLabel content={tooltip}>
      <button
        className="terminal-service-runtime__action"
        type="button"
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
    </TooltipLabel>
  )
}

type TerminalServiceRuntimeIconDefinition = readonly [Icon, string, IconWeight]

const terminalServiceRuntimeIconDefinitions = {
  close: [XIcon, 'x', 'bold'],
  copy: [CopyIcon, 'copy', 'bold'],
  edit: [PencilSimpleIcon, 'pencil-simple', 'bold'],
  locate: [CrosshairIcon, 'crosshair', 'bold'],
  'open-external': [ArrowSquareOutIcon, 'arrow-square-out', 'bold'],
  warning: [WarningIcon, 'warning', 'fill']
} satisfies Record<string, TerminalServiceRuntimeIconDefinition>

type TerminalServiceRuntimeIconRole = keyof typeof terminalServiceRuntimeIconDefinitions

interface TerminalServiceRuntimeIconProps extends Omit<IconProps, 'alt' | 'mirrored' | 'weight'> {
  readonly role: TerminalServiceRuntimeIconRole
}

function TerminalServiceRuntimeIcon({ role, ...props }: TerminalServiceRuntimeIconProps) {
  const [IconComponent, glyph, weight] = terminalServiceRuntimeIconDefinitions[role]

  return (
    <IconComponent
      {...props}
      aria-hidden="true"
      data-icon-glyph={glyph}
      data-icon-role={role}
      data-icon-weight={weight}
      focusable="false"
      weight={weight}
    />
  )
}
