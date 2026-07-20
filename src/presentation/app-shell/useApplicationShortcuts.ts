import { useEffect, useRef } from 'react'

import {
  applicationShortcutCommands,
  isContinuousApplicationShortcut,
  matchesShortcutBindingKey,
  matchesShortcutEvent,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand,
  type ShortcutPlatform
} from './applicationShortcuts'

interface ApplicationShortcutAction {
  readonly enabled: boolean
  readonly run: () => void | Promise<void>
  readonly stop?: () => void
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
    const activeCommands = new Set<ApplicationShortcutCommand>()

    const stopCommand = (command: ApplicationShortcutCommand): void => {
      if (!activeCommands.delete(command)) {
        return
      }
      actionsRef.current[command].stop?.()
    }

    const stopAllCommands = (): void => {
      for (const command of [...activeCommands]) {
        stopCommand(command)
      }
    }

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
      if (
        command === undefined ||
        !action?.enabled ||
        (event.repeat && !activeCommands.has(command))
      ) {
        return
      }

      event.preventDefault()
      if (event.repeat) {
        return
      }

      if (isContinuousApplicationShortcut(command) && action.stop) {
        activeCommands.add(command)
      }
      void action.run()
    }

    const stopShortcut = (event: KeyboardEvent): void => {
      for (const command of [...activeCommands]) {
        const binding = bindings[command]
        if (
          matchesShortcutBindingKey(event, binding) ||
          isRequiredShortcutModifier(event.key, binding, platform)
        ) {
          event.preventDefault()
          stopCommand(command)
        }
      }
    }

    const stopWhenPageIsHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        stopAllCommands()
      }
    }

    document.addEventListener('keydown', dispatchShortcut)
    document.addEventListener('keyup', stopShortcut)
    document.addEventListener('visibilitychange', stopWhenPageIsHidden)
    window.addEventListener('blur', stopAllCommands)
    return () => {
      stopAllCommands()
      document.removeEventListener('keydown', dispatchShortcut)
      document.removeEventListener('keyup', stopShortcut)
      document.removeEventListener('visibilitychange', stopWhenPageIsHidden)
      window.removeEventListener('blur', stopAllCommands)
    }
  }, [bindings, platform])
}

function isRequiredShortcutModifier(
  key: string,
  binding: ApplicationShortcutBindings[ApplicationShortcutCommand],
  platform: ShortcutPlatform
): boolean {
  if (binding === null) {
    return false
  }

  return (
    (binding.primary && key === (platform === 'mac' ? 'Meta' : 'Control')) ||
    (binding.alt && (key === 'Alt' || key === 'AltGraph')) ||
    (binding.shift && key === 'Shift')
  )
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
