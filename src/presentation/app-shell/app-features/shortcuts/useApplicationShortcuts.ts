import { useEffect, useRef } from 'react'

import {
  applicationShortcutCommands,
  matchesShortcutEvent,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand,
  type ShortcutPlatform
} from './applicationShortcuts'

interface ApplicationShortcutAction {
  readonly enabled: boolean
  readonly run: () => void | Promise<void>
}

export type ApplicationShortcutActions = Readonly<
  Record<ApplicationShortcutCommand, ApplicationShortcutAction>
>

interface UseApplicationShortcutsInput {
  readonly actions: ApplicationShortcutActions
  readonly bindings: ApplicationShortcutBindings
  readonly platform: ShortcutPlatform
}

const directionalCanvasSelectionCommands = new Set<ApplicationShortcutCommand>([
  'selectCanvasNodeLeft',
  'selectCanvasNodeRight',
  'selectCanvasNodeUp',
  'selectCanvasNodeDown'
])

export function useApplicationShortcuts({
  actions,
  bindings,
  platform
}: UseApplicationShortcutsInput): void {
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  useEffect(() => {
    const dispatchShortcut = (event: KeyboardEvent, capturePhase: boolean): void => {
      if (
        event.defaultPrevented ||
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      ) {
        return
      }

      const command = applicationShortcutCommands.find((candidate) =>
        matchesShortcutEvent(event, bindings[candidate], platform)
      )
      if (command === undefined) return
      const scope =
        event.target instanceof Element ? event.target.closest('[data-shortcut-capture]') : null
      // The nearest input owner may explicitly retain shell navigation commands.
      // Nested menus and shortcut recorders keep their own, stricter ownership.
      if (scope && !scope.getAttribute('data-shortcut-allow')?.split(' ').includes(command)) return
      const isDirectionalSelection = directionalCanvasSelectionCommands.has(command)
      if (!isDirectionalSelection && isProtectedShortcutTarget(event.target)) {
        return
      }
      const captureCommand = isDirectionalSelection || scope !== null
      if (captureCommand !== capturePhase) {
        return
      }

      const action = actionsRef.current[command]
      if (!action.enabled) {
        return
      }

      event.preventDefault()
      if (captureCommand) {
        event.stopPropagation()
      }
      if (event.repeat) {
        return
      }

      void action.run()
    }
    const dispatchCapturedShortcut = (event: KeyboardEvent): void => {
      dispatchShortcut(event, true)
    }
    const dispatchBubblingShortcut = (event: KeyboardEvent): void => {
      dispatchShortcut(event, false)
    }

    document.addEventListener('keydown', dispatchCapturedShortcut, true)
    document.addEventListener('keydown', dispatchBubblingShortcut)
    return () => {
      document.removeEventListener('keydown', dispatchCapturedShortcut, true)
      document.removeEventListener('keydown', dispatchBubblingShortcut)
    }
  }, [bindings, platform])
}

function isProtectedShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .xterm'
    ) !== null
  )
}
