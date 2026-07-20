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
    const dispatchShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        isProtectedShortcutTarget(event.target) ||
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      ) {
        return
      }

      const command = applicationShortcutCommands.find((candidate) =>
        matchesShortcutEvent(event, bindings[candidate], platform)
      )
      const action = command === undefined ? undefined : actionsRef.current[command]
      if (command === undefined || !action?.enabled) {
        return
      }

      event.preventDefault()
      if (event.repeat) {
        return
      }

      void action.run()
    }

    document.addEventListener('keydown', dispatchShortcut)
    return () => {
      document.removeEventListener('keydown', dispatchShortcut)
    }
  }, [bindings, platform])
}

function isProtectedShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .xterm, [data-shortcut-capture]'
    ) !== null
  )
}
