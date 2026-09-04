import { execFile } from 'node:child_process'

import {
  type AgentProviderCliProcessInvocation,
  createAgentProviderCliProcessInvocation,
  resolveAgentProviderInspectionTimeout
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
    `$codexExecutable = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(executable, 'utf8').toString('base64')}'))`,
    '$codexCommand = @(Get-Command -Name $codexExecutable -CommandType Application,ExternalScript -ErrorAction Stop)[0]',
    // ASCII base64 avoids both console encoding changes and Utility-module cold initialization.
    '[Console]::Out.Write([System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($codexCommand.Path)))'
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
        timeout: resolveAgentProviderInspectionTimeout(),
        windowsHide: true
      },
      (error, stdout) => {
        if (error) return reject(error)
        try {
          const encodedPath = stdout.trim()
          const value = Buffer.from(encodedPath, 'base64').toString('utf8')
          if (!value || Buffer.from(value, 'utf8').toString('base64') !== encodedPath)
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
