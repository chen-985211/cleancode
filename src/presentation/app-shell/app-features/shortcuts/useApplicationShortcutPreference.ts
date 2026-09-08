import { useCallback, useState } from 'react'

import {
  getDefaultApplicationShortcutBindings,
  resolveShortcutPlatform,
  type ShortcutPlatform,
  type ApplicationShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand
} from './applicationShortcuts'
import {
  readApplicationShortcutBindings,
  writeApplicationShortcutBindings
} from './applicationShortcutPreference'

export function useApplicationShortcutPreference(
  platform: ShortcutPlatform = resolveShortcutPlatform()
) {
  const [bindings, setBindings] = useState<ApplicationShortcutBindings>(() =>
    readApplicationShortcutBindings(window.localStorage, platform)
  )

  const changeBinding = useCallback(
    (command: ApplicationShortcutCommand, binding: ApplicationShortcutBinding | null): void => {
      setBindings((current) => persistBindings({ ...current, [command]: binding }))
    },
    []
  )

  const resetAllBindings = useCallback((): void => {
    setBindings(persistBindings(getDefaultApplicationShortcutBindings(platform)))
  }, [platform])

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
