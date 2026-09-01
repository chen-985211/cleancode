import type { TerminalCanvasObjectContextTarget } from '../view-models/terminalCanvasContextTarget'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { CanvasMenuItem } from '../../../../presentation/shared/components/CanvasMenuItem'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'

interface TerminalCanvasContextActionsProps {
  readonly target: TerminalCanvasObjectContextTarget
  readonly onAddToQuickExecution?: (target: TerminalCanvasObjectContextTarget) => void
  readonly onClose: () => void
  readonly onFavorite?: (terminalBlockIds: readonly string[]) => void
  readonly onRemove?: (target: TerminalCanvasObjectContextTarget) => void
}

export function TerminalCanvasContextActions({
  target,
  onAddToQuickExecution,
  onClose,
  onFavorite,
  onRemove
}: TerminalCanvasContextActionsProps) {
  const { t } = useI18n()

  return (
    <>
      <CanvasMenuItem
        type="button"
        role="menuitem"
        onClick={() => {
          onClose()
          onFavorite?.(target.terminalBlockIds)
        }}
      >
        <WorkbenchIcon role="favorite" size={16} />
        {t(`canvas.contextMenu.favorite.${target.kind}`)}
      </CanvasMenuItem>
      {onAddToQuickExecution ? (
        <CanvasMenuItem
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onAddToQuickExecution(target)
          }}
        >
          <WorkbenchIcon role="quick-execution-add" size={16} />
          {t('canvas.contextMenu.addToQuickExecution')}
        </CanvasMenuItem>
      ) : null}
      {target.kind !== 'terminal' && onRemove ? (
        <CanvasMenuItem
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onRemove(target)
          }}
        >
          <WorkbenchIcon role="delete" size={16} />
          {t(`canvas.contextMenu.remove.${target.kind}`)}
        </CanvasMenuItem>
      ) : null}
    </>
  )
}
