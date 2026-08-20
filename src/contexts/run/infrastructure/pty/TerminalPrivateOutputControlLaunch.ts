import type { StartTerminalProcessCommand } from '../../application/ports/TerminalProcessPort'
import {
  acceptTerminalPrivateOutput,
  createTerminalPrivateOutputControl,
  flushTerminalPrivateOutput,
  isTerminalPrivateOutputControlToken,
  type TerminalPrivateOutputControl
} from './TerminalPrivateOutputControl'

export interface TerminalPrivateOutputControlLaunch {
  readonly control: TerminalPrivateOutputControl
  readonly environment: Readonly<Record<string, string>>
}

export function createTerminalPrivateOutputControlLaunch(
  command: Pick<StartTerminalProcessCommand, 'privateOutputControl' | 'terminalSourceTheme'>,
  platform: NodeJS.Platform
): TerminalPrivateOutputControlLaunch | null {
  const descriptor = command.privateOutputControl
  if (
    platform !== 'win32' ||
    descriptor?.protocol !== 'osc-633-span-v1' ||
    !isTerminalPrivateOutputControlToken(descriptor.token) ||
    !isStringEnvironment(descriptor.environment)
  ) {
    return null
  }
  return {
    control: createTerminalPrivateOutputControl(descriptor),
    environment: {
      ...descriptor.environment,
      CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: descriptor.token,
      CLEANCODE_TERMINAL_SOURCE_THEME: command.terminalSourceTheme ?? 'dark'
    }
  }
}

export function acceptTerminalPrivateOutputControl(
  control: TerminalPrivateOutputControl | null,
  data: string
): string {
  return control ? acceptTerminalPrivateOutput(control, data) : data
}

export function flushTerminalPrivateOutputControl(
  control: TerminalPrivateOutputControl | null
): string {
  return control ? flushTerminalPrivateOutput(control) : ''
}

export function applyTerminalPrivateOutputControlEnvironment(
  target: Record<string, string>,
  launch: TerminalPrivateOutputControlLaunch | null,
  platform: NodeJS.Platform
): void {
  if (platform === 'win32') {
    deleteEnvironmentValue(target, 'CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN')
    deleteEnvironmentValue(target, 'CLEANCODE_TERMINAL_SOURCE_THEME')
  }
  if (!launch) return
  for (const [name, value] of Object.entries(launch.environment)) {
    replaceEnvironmentValue(target, name, value, platform)
  }
}

function isStringEnvironment(value: unknown): value is Readonly<Record<string, string>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.entries(value).every(
      ([name, entry]) =>
        name.length > 0 && name.includes('=') === false && typeof entry === 'string'
    )
  )
}

function replaceEnvironmentValue(
  environment: Record<string, string>,
  name: string,
  value: string,
  platform: NodeJS.Platform
): void {
  if (platform === 'win32') {
    const normalizedName = name.toLowerCase()
    for (const candidate of Object.keys(environment)) {
      if (candidate.toLowerCase() === normalizedName) delete environment[candidate]
    }
  } else {
    delete environment[name]
  }
  environment[name] = value
}

function deleteEnvironmentValue(environment: Record<string, string>, name: string): void {
  const normalizedName = name.toLowerCase()
  for (const candidate of Object.keys(environment)) {
    if (candidate.toLowerCase() === normalizedName) delete environment[candidate]
  }
}
