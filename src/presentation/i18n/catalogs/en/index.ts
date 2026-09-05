import type { MessageCatalog } from '../zh-CN'
import { enCommonMessages } from './common'
import { enSettingsMessages } from './settings'
import { enProjectMessages } from './project'
import { enCanvasMessages } from './canvas'
import { enTemplatesMessages } from './templates'
import { enTerminalMessages } from './terminal'
import { enWorkflowMessages } from './workflow'
import { enAgentMessages } from './agent'
import { enDiagnosticsMessages } from './diagnostics'
import { enErrorsMessages } from './errors'

export const enMessages = {
  ...enCommonMessages,
  ...enSettingsMessages,
  ...enProjectMessages,
  ...enCanvasMessages,
  ...enTemplatesMessages,
  ...enTerminalMessages,
  ...enWorkflowMessages,
  ...enAgentMessages,
  ...enDiagnosticsMessages,
  ...enErrorsMessages
} as const satisfies MessageCatalog
