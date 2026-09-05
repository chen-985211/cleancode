import type { MessageKey } from './catalogs/zh-CN'

export const localeDefinitions = {
  'zh-CN': { labelKey: 'language.simplifiedChinese', systemLanguagePrefix: 'zh' },
  en: { labelKey: 'language.english', systemLanguagePrefix: 'en' }
} as const satisfies Record<
  string,
  { readonly labelKey: MessageKey; readonly systemLanguagePrefix: string }
>

export type Locale = keyof typeof localeDefinitions

export const supportedLocales: readonly Locale[] = Object.keys(localeDefinitions) as Locale[]
export const fallbackLocale: Locale = 'en'

export function isSupportedLocale(value: string | null): value is Locale {
  return supportedLocales.some((locale) => locale === value)
}
