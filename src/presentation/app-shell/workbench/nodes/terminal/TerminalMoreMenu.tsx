import {
  TerminalSessionMenuItems,
  type TerminalSessionMenuItemsProps
} from '../../../../../contexts/run/presentation/components/TerminalSessionMenuItems'
import { useI18n } from '../../../../i18n/useI18n'
import { CanvasMenuItem } from '../../../../shared/components/CanvasMenuItem'
import { WorkbenchIcon } from '../../../../shared/components/WorkbenchIcons'
import { CanvasNodeMoreMenu } from '../../menus/CanvasNodeMoreMenu'

type TerminalMoreMenuProps = Omit<TerminalSessionMenuItemsProps, 'onAction'> & {
  readonly onDelete: () => void
}

export function TerminalMoreMenu({ onDelete, ...sessionProps }: TerminalMoreMenuProps) {
  const { t } = useI18n()
  return (
    <CanvasNodeMoreMenu
      label={t('terminal.namedAction', {
        blockName: sessionProps.terminalName,
        action: t('terminal.action.more')
      })}
      tooltip={t('terminal.action.more')}
      triggerClassName="terminal-node__action"
      iconName="terminal-more"
    >
      {(close) => (
        <>
          <TerminalSessionMenuItems {...sessionProps} onAction={close} />
          <CanvasMenuItem
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-label={t('terminal.namedAction', {
              blockName: sessionProps.terminalName,
              action: t('terminal.action.delete')
            })}
            onClick={() => {
              close()
              onDelete()
            }}
          >
            <WorkbenchIcon role="delete" data-icon="terminal-delete" size={16} />
            <span className="canvas-pane-context-menu__label">{t('terminal.action.delete')}</span>
          </CanvasMenuItem>
        </>
      )}
    </CanvasNodeMoreMenu>
  )
}
