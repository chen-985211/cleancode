import { createTerminalCapabilityEnvironment } from '../../application/services/TerminalCapabilityEnvironment'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

const electronRunAsNodeEnvironmentName = 'ELECTRON_RUN_AS_NODE'

export function createTerminalProcessEnvironment(input: {
  readonly explicit: Readonly<Record<string, string>> | undefined
  readonly inherited: Readonly<Record<string, string | undefined>>
  readonly platform: NodeJS.Platform
  readonly terminalSourceTheme?: TerminalSourceTheme
}): Record<string, string> {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(input.inherited).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string'
    })
  )
  deleteEnvironmentName(
    inheritedEnvironment,
    electronRunAsNodeEnvironmentName,
    input.platform === 'win32'
  )

  const terminalEnvironment = createTerminalCapabilityEnvironment(
    input.explicit,
    input.terminalSourceTheme ?? 'dark'
  )
  for (const [name, value] of Object.entries(terminalEnvironment)) {
    deleteEnvironmentName(inheritedEnvironment, name, input.platform === 'win32')
    inheritedEnvironment[name] = value
  }

  inheritedEnvironment.PROMPT_EOL_MARK = ''
  return inheritedEnvironment
}

function deleteEnvironmentName(
  environment: Record<string, string>,
  name: string,
  isCaseInsensitive: boolean
): void {
  if (!isCaseInsensitive) {
    delete environment[name]
    return
  }

  const normalizedName = name.toLowerCase()
  for (const candidate of Object.keys(environment)) {
    if (candidate.toLowerCase() === normalizedName) delete environment[candidate]
  }
}
