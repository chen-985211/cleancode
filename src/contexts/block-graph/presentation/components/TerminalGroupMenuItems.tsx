import { useI18n } from '../../../../presentation/i18n/useI18n'
import { CanvasMenuItem } from '../../../../presentation/shared/components/CanvasMenuItem'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'

export function TerminalGroupMenuItems({
  onRename,
  onDissolve,
  onAction
}: {
  readonly onRename: () => void
  readonly onDissolve: () => void
  readonly onAction: () => void
}) {
  const { t } = useI18n()
  return (
    <>
      <CanvasMenuItem
        type="button"
        role="menuitem"
        onClick={() => {
          onAction()
          onRename()
        }}
      >
        <WorkbenchIcon role="edit" size={16} />
        <span className="canvas-pane-context-menu__label">{t('group.action.rename')}</span>
      </CanvasMenuItem>
      <TooltipLabel content={t('group.action.dissolveDescription')}>
        <CanvasMenuItem
          type="button"
          role="menuitem"
          onClick={() => {
            onAction()
            onDissolve()
          }}
        >
          <WorkbenchIcon role="disconnect" size={16} />
          <span className="canvas-pane-context-menu__label">{t('group.action.dissolve')}</span>
        </CanvasMenuItem>
      </TooltipLabel>
    </>
  )
}
