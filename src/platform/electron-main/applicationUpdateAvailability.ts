import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ApplicationUpdateSnapshot } from '../ipc/applicationUpdateChannels'

export function resolveApplicationUpdateAvailability(input: {
  readonly isPackaged: boolean
  readonly platform: string
  readonly isAppImage: boolean
  readonly macSignature?: string
}): ApplicationUpdateSnapshot['unavailableReason'] {
  if (!input.isPackaged) return 'development'
  if (input.platform === 'darwin') {
    const signed =
      /^Authority=Developer ID Application:/m.test(input.macSignature ?? '') &&
      /^TeamIdentifier=[A-Z0-9]+$/m.test(input.macSignature ?? '')
    return signed ? undefined : 'unsigned'
  }
  if (input.platform === 'win32' || (input.platform === 'linux' && input.isAppImage))
    return undefined
  return 'unsupported'
}

export async function readMacApplicationSignature(executable: string): Promise<string> {
  try {
    const { stderr } = await promisify(execFile)(
      '/usr/bin/codesign',
      ['--display', '--verbose=2', executable],
      {
        timeout: 5000,
        maxBuffer: 64 * 1024
      }
    )
    return stderr
  } catch {
    return ''
  }
}
