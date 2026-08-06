import { useCallback, useState } from 'react'

import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { CanvasPaneContextMenu } from './CanvasPaneContextMenu'

interface CanvasPaneContextMenuEvent {
  readonly clientX: number
  readonly clientY: number
  preventDefault: () => void
}

interface UseCanvasPaneContextMenuOptions {
  readonly canCreateTerminal: boolean
  readonly canGroupTerminals: boolean
  readonly graphId: string | null
  readonly isBlocked: boolean
  readonly shortcutTooltips: Pick<
    ApplicationShortcutTooltipLabels,
    'createTerminal' | 'groupTerminals'
  >
  readonly onBeforeOpen: () => void
  readonly onBeginTerminalGroupSelection?: () => void
  readonly onCreateTerminal: (position: { readonly x: number; readonly y: number }) => void
  readonly onCreateTerminalGroup?: (position: { readonly x: number; readonly y: number }) => void
  readonly onFitCanvas?: () => void
}

export function useCanvasPaneContextMenu({
  canCreateTerminal,
  canGroupTerminals,
  graphId,
  isBlocked,
  shortcutTooltips,
  onBeforeOpen,
  onBeginTerminalGroupSelection,
  onCreateTerminal,
  onCreateTerminalGroup,
  onFitCanvas
}: UseCanvasPaneContextMenuOptions) {
  const [position, setPosition] = useState<{
    readonly graphId: string | null
    readonly x: number
    readonly y: number
  } | null>(null)
  const close = useCallback(() => setPosition(null), [])
  const open = useCallback(
    (event: CanvasPaneContextMenuEvent): void => {
      event.preventDefault()
      onBeforeOpen()
      if (isBlocked) {
        close()
        return
      }
      setPosition({ graphId, x: event.clientX, y: event.clientY })
    },
    [close, graphId, isBlocked, onBeforeOpen]
  )

  return {
    close,
    menu:
      position?.graphId === graphId ? (
        <CanvasPaneContextMenu
          canCreateTerminal={canCreateTerminal}
          canGroupTerminals={canGroupTerminals}
          position={position}
          shortcutTooltips={shortcutTooltips}
          onClose={close}
          onCreateTerminal={() => onCreateTerminal(position)}
          onGroupTerminals={() => {
            if (onCreateTerminalGroup) onCreateTerminalGroup(position)
            else {
              onBeginTerminalGroupSelection?.()
              onFitCanvas?.()
            }
          }}
        />
      ) : null,
    open
  } as const
}
