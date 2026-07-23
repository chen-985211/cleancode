import type {
  AgentProviderContribution,
  AgentProviderLaunchConfiguration,
  AgentProviderPermissionConfiguration
} from '../../../application/ports/AgentProviderContribution'
import { ClaudeCodeAgentProviderContribution } from '../claude-code/ClaudeCodeAgentProviderContribution'
import { CodexAgentProviderContribution } from '../codex/CodexAgentProviderContribution'
import { HermesAgentProviderContribution } from '../hermes/HermesAgentProviderContribution'
import { OpenClawAgentProviderContribution } from '../openclaw/OpenClawAgentProviderContribution'
import { OpenCodeAgentProviderContribution } from '../opencode/OpenCodeAgentProviderContribution'
import { PiAgentProviderContribution } from '../pi/PiAgentProviderContribution'
import {
  CatalogTerminalCliProvider,
  type CatalogTerminalCliProviderConfig
} from './CatalogTerminalCliProvider'
import { createCatalogProviderIcon } from './CatalogProviderIcons'

export const builtinAgentProviderIds = [
  'claude-code',
  'openclaude',
  'codex',
  'grok',
  'copilot',
  'opencode',
  'mimo-code',
  'ante',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'autohand',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'devin',
  'openclaw'
] as const

interface CatalogEntry {
  readonly defaultArguments?: readonly string[]
  readonly defaultEnvironment?: Readonly<Record<string, string>>
  readonly detectionExecutable?: string
  readonly displayName: string
  readonly documentationUrl: string
  readonly executable: string
  readonly executableAliases?: readonly string[]
  readonly id: (typeof builtinAgentProviderIds)[number]
  readonly permission?: AgentProviderPermissionConfiguration
}

const genericCatalogEntries: readonly CatalogEntry[] = [
  entry('openclaude', 'OpenClaude', 'openclaude', 'https://openclaude.gitlawb.com/', {
    permission: { arguments: ['--dangerously-skip-permissions'] }
  }),
  entry('grok', 'Grok', 'grok', 'https://x.ai/cli', {
    permission: { arguments: ['--permission-mode', 'bypassPermissions'] }
  }),
  entry(
    'copilot',
    'GitHub Copilot',
    'copilot',
    'https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli',
    { permission: { arguments: ['--yolo'] } }
  ),
  entry('mimo-code', 'MiMo Code', 'mimo', 'https://mimo.xiaomi.com/coder'),
  entry('ante', 'Ante', 'ante', 'https://github.com/AntigmaLabs/ante-preview', {
    permission: { arguments: ['--yolo'] }
  }),
  entry('omp', 'OMP', 'omp', 'https://omp.sh'),
  entry('gemini', 'Gemini', 'gemini', 'https://github.com/google-gemini/gemini-cli', {
    permission: { arguments: ['--approval-mode=yolo'] }
  }),
  entry('antigravity', 'Antigravity', 'agy', 'https://antigravity.google/docs/cli-overview', {
    permission: { arguments: ['--dangerously-skip-permissions'] }
  }),
  entry('aider', 'Aider', 'aider', 'https://aider.chat/docs/', {
    permission: { arguments: ['--yes-always'] }
  }),
  entry('goose', 'Goose', 'goose', 'https://block.github.io/goose/docs/quickstart/', {
    permission: { environment: { GOOSE_MODE: 'auto' } }
  }),
  entry('amp', 'Amp', 'amp', 'https://ampcode.com/manual#install'),
  entry('kilo', 'Kilocode', 'kilo', 'https://kilo.ai/docs/cli'),
  entry('kiro', 'Kiro', 'kiro-cli', 'https://kiro.dev/docs/cli/', {
    defaultArguments: ['chat'],
    permission: { arguments: ['--trust-all-tools'] }
  }),
  entry('crush', 'Charm', 'crush', 'https://github.com/charmbracelet/crush', {
    permission: { arguments: ['--yolo'] }
  }),
  entry('aug', 'Auggie', 'auggie', 'https://docs.augmentcode.com/cli/overview'),
  entry('autohand', 'Autohand Code', 'autohand', 'https://github.com/autohandai/code-cli', {
    permission: { arguments: ['--unrestricted'] }
  }),
  entry('cline', 'Cline', 'cline', 'https://docs.cline.bot/cline-cli/overview', {
    permission: { arguments: ['--auto-approve', 'true'] }
  }),
  entry('codebuff', 'Codebuff', 'codebuff', 'https://www.codebuff.com/docs/help/quick-start'),
  entry('command-code', 'Command Code', 'cmd', 'https://commandcode.ai/docs/quickstart', {
    defaultArguments: ['--trust'],
    permission: { arguments: ['--yolo'] }
  }),
  entry('continue', 'Continue', 'cn', 'https://docs.continue.dev/guides/cli', {
    permission: { arguments: ['--auto'] }
  }),
  entry('cursor', 'Cursor', 'cursor-agent', 'https://cursor.com/cli', {
    permission: { arguments: ['--yolo'] }
  }),
  entry('droid', 'Droid', 'droid', 'https://docs.factory.ai/cli/getting-started/quickstart', {
    permission: { arguments: ['--skip-permissions-unsafe'] }
  }),
  entry(
    'kimi',
    'Kimi',
    'kimi',
    'https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html',
    { permission: { arguments: ['--yolo'] } }
  ),
  entry('mistral-vibe', 'Mistral Vibe', 'vibe', 'https://github.com/mistralai/mistral-vibe', {
    executableAliases: ['mistral-vibe'],
    permission: { arguments: ['--agent', 'auto-approve'] }
  }),
  entry('qwen-code', 'Qwen Code', 'qwen', 'https://github.com/QwenLM/qwen-code', {
    permission: { arguments: ['--approval-mode', 'yolo'] }
  }),
  entry(
    'rovo',
    'Rovo Dev',
    'acli',
    'https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/',
    {
      defaultArguments: ['rovodev', 'run'],
      permission: { arguments: ['--yolo'] }
    }
  ),
  entry('devin', 'Devin', 'devin', 'https://devin.ai/cli', {
    permission: { arguments: ['--permission-mode', 'bypass'] }
  })
]

export function createBuiltinAgentProviderContributions(): readonly AgentProviderContribution[] {
  const formal = new Map<string, AgentProviderContribution>([
    ['claude-code', new ClaudeCodeAgentProviderContribution()],
    ['codex', new CodexAgentProviderContribution()],
    ['opencode', new OpenCodeAgentProviderContribution()],
    ['pi', new PiAgentProviderContribution()],
    ['hermes', new HermesAgentProviderContribution()],
    ['openclaw', new OpenClawAgentProviderContribution()]
  ])
  const generic = new Map(
    genericCatalogEntries.map((catalogEntry) => [
      catalogEntry.id,
      new CatalogTerminalCliProvider(toContributionConfig(catalogEntry))
    ])
  )
  return builtinAgentProviderIds.map((providerId) => {
    const contribution = formal.get(providerId) ?? generic.get(providerId)
    if (!contribution) throw new Error(`Missing built-in Agent Provider: ${providerId}`)
    return contribution
  })
}

function entry(
  id: CatalogEntry['id'],
  displayName: string,
  executable: string,
  documentationUrl: string,
  options: Partial<
    Omit<CatalogEntry, 'displayName' | 'documentationUrl' | 'executable' | 'id'>
  > = {}
): CatalogEntry {
  return { displayName, documentationUrl, executable, id, ...options }
}

function toContributionConfig(catalogEntry: CatalogEntry): CatalogTerminalCliProviderConfig {
  const launch: AgentProviderLaunchConfiguration = {
    defaultArguments: catalogEntry.defaultArguments ?? [],
    defaultEnvironment: catalogEntry.defaultEnvironment ?? {},
    executable: catalogEntry.executable,
    ...(catalogEntry.permission ? { permission: catalogEntry.permission } : {})
  }
  return {
    detectionExecutable: catalogEntry.detectionExecutable,
    displayName: catalogEntry.displayName,
    documentationUrl: catalogEntry.documentationUrl,
    executableAliases: catalogEntry.executableAliases,
    icon: createCatalogProviderIcon(catalogEntry.id),
    id: catalogEntry.id,
    launch
  }
}
