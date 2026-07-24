import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const interruptTimeoutMs = 10_000

export async function interruptWindowsForegroundJob(
  terminalProcessId: number,
  launchScriptPath: string
): Promise<void> {
  const invocation = createWindowsForegroundJobInterruptInvocation(
    terminalProcessId,
    launchScriptPath
  )

  await execFileAsync(invocation.executable, [...invocation.args], {
    timeout: interruptTimeoutMs,
    windowsHide: true
  })
}

export function createWindowsForegroundJobInterruptInvocation(
  terminalProcessId: number,
  launchScriptPath: string
): { readonly args: readonly string[]; readonly executable: string } {
  if (!Number.isSafeInteger(terminalProcessId) || terminalProcessId <= 0) {
    throw new Error('Invalid terminal process id.')
  }
  const encodedScript = Buffer.from(
    createInterruptScript(terminalProcessId, launchScriptPath),
    'utf16le'
  ).toString('base64')

  return {
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedScript
    ],
    executable: 'powershell.exe'
  }
}

function createInterruptScript(terminalProcessId: number, launchScriptPath: string): string {
  const encodedLaunchScriptPath = Buffer.from(launchScriptPath, 'utf8').toString('base64')

  return [
    '$cleancodeInterruptEncoding = [System.Text.Encoding]::UTF8',
    `$cleancodeLaunchScriptPath = $cleancodeInterruptEncoding.GetString([System.Convert]::FromBase64String('${encodedLaunchScriptPath}'))`,
    `$cleancodeTerminalProcessId = ${terminalProcessId}`,
    '$cleancodeForegroundProcesses = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $cleancodeTerminalProcessId" | Where-Object {',
    '  $_.CommandLine -and $_.CommandLine.Contains($cleancodeLaunchScriptPath)',
    '})',
    'foreach ($cleancodeForegroundProcess in $cleancodeForegroundProcesses) {',
    '  & taskkill.exe /PID $cleancodeForegroundProcess.ProcessId /T /F | Out-Null',
    '  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    '}',
    'exit 0'
  ].join('\n')
}
