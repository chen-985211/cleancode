export const supportedLocales = ['zh-CN', 'en'] as const

export type Locale = (typeof supportedLocales)[number]

export function isSupportedLocale(value: string | null): value is Locale {
  return supportedLocales.some((locale) => locale === value)
}
