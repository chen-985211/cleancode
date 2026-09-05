import { zhCNCommonMessages } from './common'
import { zhCNSettingsMessages } from './settings'
import { zhCNProjectMessages } from './project'
import { zhCNCanvasMessages } from './canvas'
import { zhCNTemplatesMessages } from './templates'
import { zhCNTerminalMessages } from './terminal'
import { zhCNWorkflowMessages } from './workflow'
import { zhCNAgentMessages } from './agent'
import { zhCNDiagnosticsMessages } from './diagnostics'
import { zhCNErrorsMessages } from './errors'

export const zhCNMessages = {
  ...zhCNCommonMessages,
  ...zhCNSettingsMessages,
  ...zhCNProjectMessages,
  ...zhCNCanvasMessages,
  ...zhCNTemplatesMessages,
  ...zhCNTerminalMessages,
  ...zhCNWorkflowMessages,
  ...zhCNAgentMessages,
  ...zhCNDiagnosticsMessages,
  ...zhCNErrorsMessages
} as const

export type MessageKey = keyof typeof zhCNMessages
export type MessageCatalog = { readonly [Key in MessageKey]: string }
