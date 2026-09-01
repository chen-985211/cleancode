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
    const dispatchShortcut = (event: KeyboardEvent, captureDirectional: boolean): void => {
      if (
        event.defaultPrevented ||
        isShortcutCaptureTarget(event.target) ||
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      ) {
        return
      }

      const command = applicationShortcutCommands.find((candidate) =>
        matchesShortcutEvent(event, bindings[candidate], platform)
      )
      const isDirectionalSelection =
        command !== undefined && directionalCanvasSelectionCommands.has(command)
      if (!isDirectionalSelection && isProtectedShortcutTarget(event.target)) {
        return
      }
      if (isDirectionalSelection !== captureDirectional) {
        return
      }

      const action = command === undefined ? undefined : actionsRef.current[command]
      if (command === undefined || !action?.enabled) {
        return
      }

      event.preventDefault()
      if (isDirectionalSelection) {
        event.stopPropagation()
      }
      if (event.repeat) {
        return
      }

      void action.run()
    }
    const captureDirectionalShortcut = (event: KeyboardEvent): void => {
      dispatchShortcut(event, true)
    }
    const dispatchBubblingShortcut = (event: KeyboardEvent): void => {
      dispatchShortcut(event, false)
    }

    document.addEventListener('keydown', captureDirectionalShortcut, true)
    document.addEventListener('keydown', dispatchBubblingShortcut)
    return () => {
      document.removeEventListener('keydown', captureDirectionalShortcut, true)
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

function isShortcutCaptureTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-shortcut-capture]') !== null
}
