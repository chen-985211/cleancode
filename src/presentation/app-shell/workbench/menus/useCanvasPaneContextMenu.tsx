import { useCallback, useRef, useState } from 'react'

import type { ApplicationShortcutTooltipLabels } from '../../app-features/shortcuts/applicationShortcutTooltips'
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

interface CanvasPaneContextMenuState {
  readonly graphId: string | null
  readonly open: boolean
  readonly x: number
  readonly y: number
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
  const [position, setPosition] = useState<CanvasPaneContextMenuState | null>(null)
  const openIntentRef = useRef({ graphId, open: false })
  const close = useCallback(() => {
    openIntentRef.current = { ...openIntentRef.current, open: false }
    setPosition((current) => (current ? { ...current, open: false } : null))
  }, [])
  const open = useCallback(
    (event: CanvasPaneContextMenuEvent): void => {
      event.preventDefault()
      if (openIntentRef.current.graphId === graphId && openIntentRef.current.open) {
        close()
        return
      }
      onBeforeOpen()
      if (isBlocked) {
        close()
        return
      }
      openIntentRef.current = { graphId, open: true }
      setPosition({ graphId, open: true, x: event.clientX, y: event.clientY })
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
          open={position.open}
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
