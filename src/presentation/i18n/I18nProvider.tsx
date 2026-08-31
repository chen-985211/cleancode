import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { Locale } from './locale'
import {
  applyLocale,
  localePreferenceStorageKey,
  readLocalePreference,
  resolveInitialLocale
} from './localePreference'
import { translate } from './messages'
import { I18nContext, type I18nValue } from './useI18n'

export function I18nProvider({
  children,
  initialLocale
}: {
  readonly children: ReactNode
  readonly initialLocale?: Locale
}) {
  const [locale, setLocale] = useState<Locale>(
    () => initialLocale ?? resolveInitialLocale(readLocalePreference(), window.navigator.languages)
  )

  useEffect(() => applyLocale(locale), [locale])

  const selectLocale = useCallback((nextLocale: Locale): void => {
    window.localStorage.setItem(localePreferenceStorageKey, nextLocale)
    applyLocale(nextLocale)
    setLocale(nextLocale)
  }, [])
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      selectLocale,
      t: (key, variables) => translate(locale, key, variables)
    }),
    [locale, selectLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
