import {
  fallbackLocale,
  isSupportedLocale,
  localeDefinitions,
  supportedLocales,
  type Locale
} from './locale'

export const localePreferenceStorageKey = 'cleancode:locale-preference'

interface InitialLocalePreferenceInput {
  readonly root: HTMLElement
  readonly storage: Pick<Storage, 'getItem'>
  readonly systemLanguages: readonly string[]
}

export function readLocalePreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): Locale | null {
  const value = storage.getItem(localePreferenceStorageKey)

  return isSupportedLocale(value) ? value : null
}

export function resolveInitialLocale(
  preference: Locale | null,
  systemLanguages: readonly string[]
): Locale {
  if (preference) {
    return preference
  }

  const systemLanguage = systemLanguages[0]?.toLowerCase()
  return (
    supportedLocales.find((locale) =>
      systemLanguage?.startsWith(localeDefinitions[locale].systemLanguagePrefix)
    ) ?? fallbackLocale
  )
}

export function applyLocale(locale: Locale, root: HTMLElement = document.documentElement): void {
  root.lang = locale
  root.dataset.locale = locale
}

export function applyInitialLocalePreference(
  {
    root,
    storage,
    systemLanguages
  }: InitialLocalePreferenceInput = createBrowserInitialLocaleInput()
): Locale {
  const locale = resolveInitialLocale(readLocalePreference(storage), systemLanguages)

  applyLocale(locale, root)

  return locale
}

function createBrowserInitialLocaleInput(): InitialLocalePreferenceInput {
  return {
    root: document.documentElement,
    storage: window.localStorage,
    systemLanguages: window.navigator.languages
  }
}
