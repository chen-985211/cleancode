import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export function createTerminalShellCommandArguments(
  shell: string,
  launchCommand: string | undefined
): readonly string[] {
  if (!launchCommand) {
    return []
  }

  const shellName = shell
    .replaceAll('\\', '/')
    .split('/')
    .pop()
    ?.toLowerCase()
    .replace(/\.exe$/, '')

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
