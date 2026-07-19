import { createContext, useContext } from 'react'

import type { Locale } from './locale'
import { translate, type MessageKey } from './messages'

export interface I18nValue {
  readonly locale: Locale
  readonly selectLocale: (locale: Locale) => void
  readonly t: (key: MessageKey, variables?: Readonly<Record<string, string | number>>) => string
}

const defaultLocale: Locale = 'zh-CN'
const defaultValue: I18nValue = {
  locale: defaultLocale,
  selectLocale: () => undefined,
  t: (key, variables) => translate(defaultLocale, key, variables)
}

export const I18nContext = createContext<I18nValue>(defaultValue)

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
