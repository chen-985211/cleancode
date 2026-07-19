import { useEffect } from 'react'

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
  useEffect(() => {
    const dispatchShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isProtectedShortcutTarget(event.target) ||
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      ) {
        return
      }

      const command = applicationShortcutCommands.find((candidate) =>
        matchesShortcutEvent(event, bindings[candidate], platform)
      )
      if (command === undefined || !actions[command].enabled) {
        return
      }

      event.preventDefault()
      void actions[command].run()
    }

    document.addEventListener('keydown', dispatchShortcut)
    return () => document.removeEventListener('keydown', dispatchShortcut)
  }, [actions, bindings, platform])
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
