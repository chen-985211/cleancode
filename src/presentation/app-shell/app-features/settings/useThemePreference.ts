import { useCallback, useEffect, useState } from 'react'

import {
  applyEffectiveTheme,
  readThemePreference,
  resolveEffectiveTheme,
  systemDarkThemeQuery,
  themePreferenceStorageKey,
  type ThemePreference
} from './themePreference'

export function useThemePreference(): {
  readonly preference: ThemePreference
  readonly selectPreference: (preference: ThemePreference) => void
} {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference())

  useEffect(() => {
    const systemTheme = window.matchMedia(systemDarkThemeQuery)
    const applyCurrentTheme = (): void => {
      applyEffectiveTheme(resolveEffectiveTheme(preference, systemTheme.matches))
    }

    applyCurrentTheme()

    if (preference !== 'system') {
      return undefined
    }

    systemTheme.addEventListener('change', applyCurrentTheme)

    return () => systemTheme.removeEventListener('change', applyCurrentTheme)
  }, [preference])

  const selectPreference = useCallback((nextPreference: ThemePreference): void => {
    const systemPrefersDark = window.matchMedia(systemDarkThemeQuery).matches

    window.localStorage.setItem(themePreferenceStorageKey, nextPreference)
    setPreference(nextPreference)
    applyEffectiveTheme(resolveEffectiveTheme(nextPreference, systemPrefersDark))
  }, [])

  return { preference, selectPreference }
}
