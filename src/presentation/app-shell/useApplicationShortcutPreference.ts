import { useCallback, useState } from 'react'

import {
  applicationShortcutCommands,
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand
} from './applicationShortcuts'
import {
  readApplicationShortcutBindings,
  writeApplicationShortcutBindings
} from './applicationShortcutPreference'

export function useApplicationShortcutPreference() {
  const [bindings, setBindings] = useState<ApplicationShortcutBindings>(
    readApplicationShortcutBindings
  )

  const changeBinding = useCallback(
    (command: ApplicationShortcutCommand, binding: ApplicationShortcutBinding | null): void => {
      setBindings((current) => persistBindings({ ...current, [command]: binding }))
    },
    []
  )

  const resetAllBindings = useCallback((): void => {
    const defaults = Object.fromEntries(
      applicationShortcutCommands.map((command) => {
        const binding = defaultApplicationShortcutBindings[command]
        return [command, binding === null ? null : { ...binding }]
      })
    ) as ApplicationShortcutBindings
    setBindings(persistBindings(defaults))
  }, [])

  return { bindings, changeBinding, resetAllBindings }
}

function persistBindings(bindings: ApplicationShortcutBindings): ApplicationShortcutBindings {
  try {
    writeApplicationShortcutBindings(bindings)
  } catch {
    // Storage is best effort; the active session still uses the new binding.
  }
  return bindings
}
