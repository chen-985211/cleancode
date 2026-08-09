import { platform } from 'node:os'

import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalLaunchMode } from '../../application/ports/TerminalProcessPort'

export interface TerminalProcessLaunch {
  readonly executable: string
  readonly arguments: readonly string[]
}

export function createTerminalProcessLaunch(
  shell: string,
  launchCommand: string | undefined,
  launchMode: TerminalLaunchMode = 'command',
  runtimePlatform: NodeJS.Platform = platform()
): TerminalProcessLaunch {
  const arguments_ = createTerminalShellCommandArguments(shell, launchCommand, runtimePlatform)
  if (!launchCommand || launchMode === 'command') {
    return { executable: shell, arguments: arguments_ }
  }

  const shellName = getShellName(shell)
  if (shellName === 'bash' || shellName === 'zsh' || shellName === 'sh' || shellName === 'fish') {
    const commandInvocation = [shell, ...arguments_].map(quotePosixShellWord).join(' ')
    const wrapper = [
      "trap '' INT",
      `( trap - INT; exec ${commandInvocation} )`,
      `trap - INT; exec ${quotePosixShellWord(shell)}`
    ].join('\n')
    return { executable: '/bin/sh', arguments: ['-c', wrapper] }
  }
  if (shellName === 'powershell' || shellName === 'pwsh') {
    return {
      executable: shell,
      arguments: ['-NoLogo', '-NoExit', '-Command', launchCommand]
    }
  }
  if (shellName === 'cmd') {
    return { executable: shell, arguments: ['/d', '/s', '/k', launchCommand] }
  }

  return { executable: shell, arguments: arguments_ }
}

function createTerminalShellCommandArguments(
  shell: string,
  launchCommand: string | undefined,
  runtimePlatform: NodeJS.Platform
): readonly string[] {
  const shellName = getShellName(shell)

  if (!launchCommand) {
    return runtimePlatform === 'win32' && (shellName === 'powershell' || shellName === 'pwsh')
      ? ['-NoLogo', '-NoExit']
      : []
  }

  if (shellName === 'bash' || shellName === 'zsh' || shellName === 'sh') {
    return ['-lc', launchCommand]
  }
  if (shellName === 'fish') {
    return ['-l', '-c', launchCommand]
  }
  if (shellName === 'powershell' || shellName === 'pwsh') {
    return ['-NoLogo', '-Command', launchCommand]
  }
  if (shellName === 'cmd') {
    return ['/d', '/s', '/c', launchCommand]
  }

  throw createExpectedAppError(
    'TERMINAL_SHELL_UNSUPPORTED',
    'The selected shell cannot run terminal workflow commands.',
    { shell }
  )
}

function getShellName(shell: string): string | undefined {
  return shell
    .replaceAll('\\', '/')
    .split('/')
    .pop()
    ?.toLowerCase()
    .replace(/\.exe$/, '')
}

function quotePosixShellWord(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}
