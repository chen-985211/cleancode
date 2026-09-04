import { execFile } from 'node:child_process'

import {
  type AgentProviderCliProcessInvocation,
  createAgentProviderCliProcessInvocation
} from '../shared/NodeAgentProviderCliDetector'

export async function createCodexAppServerProcessInvocation(
  executable: string,
  args: readonly string[],
  options: {
    readonly environment: Readonly<Record<string, string>>
    readonly workspaceDirectory: string
  }
): Promise<AgentProviderCliProcessInvocation> {
  if (process.platform !== 'win32' || /\.(?:exe|com)$/i.test(executable)) {
    return { executable, args }
  }

  // Use PowerShell only for command discovery. The native CLI owns the JSON-RPC pipes.
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    `$codexExecutable = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(executable, 'utf8').toString('base64')}'))`,
    '$codexCommand = Get-Command -Name $codexExecutable -ErrorAction Stop | Select-Object -First 1',
    '[Console]::Out.Write((ConvertTo-Json -InputObject $codexCommand.Path -Compress))'
  ].join('\n')
  const path = await new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ],
      {
        cwd: options.workspaceDirectory,
        env: { ...process.env, ...options.environment },
        timeout: 3_000,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) return reject(error)
        try {
          const value: unknown = JSON.parse(stdout.replace(/^\uFEFF/, ''))
          if (typeof value !== 'string' || !value)
            throw new Error('Codex command has no executable path.')
          resolve(value)
        } catch (error) {
          reject(error)
        }
      }
    )
  })
  return /\.(?:exe|com)$/i.test(path)
    ? { executable: path, args }
    : createAgentProviderCliProcessInvocation(path, args)
}
