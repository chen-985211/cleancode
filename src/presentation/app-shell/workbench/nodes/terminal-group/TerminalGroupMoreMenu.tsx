import { TerminalGroupMenuItems } from '../../../../../contexts/block-graph/presentation/components/TerminalGroupMenuItems'
import { useI18n } from '../../../../i18n/useI18n'
import { CanvasNodeMoreMenu } from '../../menus/CanvasNodeMoreMenu'

export function TerminalGroupMoreMenu({
  name,
  onRename,
  onDissolve
}: {
  readonly name: string
  readonly onRename: () => void
  readonly onDissolve: () => void
}) {
  const { t } = useI18n()
  return (
    <CanvasNodeMoreMenu
      label={t('group.namedAction', { groupName: name, action: t('group.action.more') })}
      tooltip={t('group.action.more')}
      triggerClassName="terminal-group-node__action"
      controlSurface="raised"
    >
      {(close) => (
        <TerminalGroupMenuItems onRename={onRename} onDissolve={onDissolve} onAction={close} />
      )}
    </CanvasNodeMoreMenu>
  )
}
