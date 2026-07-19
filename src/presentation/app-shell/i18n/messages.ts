import type { Locale } from './locale'
import { enMessages } from './catalogs/en'
import { zhCNMessages, type MessageCatalog, type MessageKey } from './catalogs/zh-CN'

export const localeCatalogs: Readonly<Record<Locale, MessageCatalog>> = {
  'zh-CN': zhCNMessages,
  en: enMessages
}

export type Translate = (
  key: MessageKey,
  variables?: Readonly<Record<string, string | number>>
) => string

export type { MessageKey }

export function translate(
  locale: Locale,
  key: MessageKey,
  variables: Readonly<Record<string, string | number>> = {}
): string {
  return Object.entries(variables).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    localeCatalogs[locale][key]
  )
}
