import {
  createWindowsPowerShellLaunchArguments,
  encodePowerShellCommand,
  getPowerShellUtf8Bootstrap
} from '../../../../src/contexts/run/infrastructure/pty/PowerShellUtf8Bootstrap'

const expectedBootstrap = [
  'if ($ExecutionContext.SessionState.LanguageMode -eq "FullLanguage") {',
  '  try {',
  '    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
  '    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()',
  '    $OutputEncoding = [Console]::OutputEncoding',
  '  } catch {',
  '    # Encoding setup is best-effort and must not block the shell.',
  '  }',
  '}'
].join('\n')

describe('PowerShell UTF-8 bootstrap', () => {
  it('sets both console directions and native pipeline encoding without changing Profile loading', () => {
    const bootstrap = getPowerShellUtf8Bootstrap()

    expect(bootstrap).toBe(expectedBootstrap)
    expect(bootstrap).not.toMatch(/\$PROFILE|-NoProfile|chcp|cmd/i)
    expect(bootstrap).not.toContain('Write-Error')
  })

  it('encodes PowerShell source as UTF-16LE Base64 without changing complex Unicode text', () => {
    const script = `$value = '中文🙂'; Write-Output "$value 'nested'"`
    const encoded = encodePowerShellCommand(script)

    expect(encoded).toBe(Buffer.from(script, 'utf16le').toString('base64'))
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe(script)
  })

  it.each([
    { keepOpen: false, expectedPrefix: ['-NoLogo', '-EncodedCommand'] },
    { keepOpen: true, expectedPrefix: ['-NoLogo', '-NoExit', '-EncodedCommand'] }
  ])('bootstraps a short command while preserving finite/open behavior: $keepOpen', (sample) => {
    const command = `$value = '中文🙂'; Write-Output "$value 'nested'"`
    const arguments_ = createWindowsPowerShellLaunchArguments(command, sample.keepOpen)

    expect(arguments_.slice(0, sample.expectedPrefix.length)).toEqual(sample.expectedPrefix)
    expect(arguments_).not.toContain('-NoProfile')
    const startupScript = decodeEncodedCommand(arguments_)
    expect(startupScript.startsWith(`${expectedBootstrap}\n`)).toBe(true)
    expect(decodeEmbeddedCommand(startupScript)).toBe(command)
  })

  it.each([
    { keepOpen: false, expectedPrefix: ['-NoLogo', '-EncodedCommand'] },
    { keepOpen: true, expectedPrefix: ['-NoLogo', '-NoExit', '-EncodedCommand'] }
  ])('always uses EncodedCommand for a bootstrap-only launch: $keepOpen', (sample) => {
    const arguments_ = createWindowsPowerShellLaunchArguments(undefined, sample.keepOpen)

    expect(arguments_.slice(0, sample.expectedPrefix.length)).toEqual(sample.expectedPrefix)
    expect(decodeEncodedCommand(arguments_)).toBe(expectedBootstrap)
  })

  it('falls back to the unchanged raw command when the encoded wrapper exceeds its limit', () => {
    const command = `Write-Output '${'x'.repeat(11_000)}'`
    const arguments_ = createWindowsPowerShellLaunchArguments(command, false)

    expect(arguments_).toEqual(['-NoLogo', '-Command', command])
  })

  it('round-trips PowerShell quoting, line endings, interpolation text, and Unicode', () => {
    const command = [
      `$single = 'it''s literal'`,
      '$double = "中文🙂 $single `"quoted`""',
      'Write-Output "$double"'
    ].join('\r\n')
    const arguments_ = createWindowsPowerShellLaunchArguments(command, false)
    const startupScript = decodeEncodedCommand(arguments_)

    expect(decodeEmbeddedCommand(startupScript)).toBe(command)
    expect(startupScript).not.toMatch(/FromBase64String|ScriptBlock\]::Create/u)
  })

  it('uses the policy-aware built-in evaluator instead of restricted .NET script creation', () => {
    const arguments_ = createWindowsPowerShellLaunchArguments('Write-Output ready', true)
    const startupScript = decodeEncodedCommand(arguments_)

    expect(startupScript).toContain(
      "Microsoft.PowerShell.Utility\\Invoke-Expression -Command 'Write-Output ready'"
    )
    expect(startupScript).not.toMatch(/ScriptBlock|FromBase64String|Convert\]::/u)
  })

  it('keeps PowerShell prologue commands in their own parser boundary', () => {
    const command = [
      'using namespace System.Text',
      'param([string] $Value = "ready")',
      '[Console]::WriteLine($Value)'
    ].join('\n')
    const arguments_ = createWindowsPowerShellLaunchArguments(command, false)
    const startupScript = decodeEncodedCommand(arguments_)

    expect(startupScript.indexOf('[Console]::OutputEncoding')).toBeLessThan(
      startupScript.indexOf('Microsoft.PowerShell.Utility\\Invoke-Expression')
    )
    expect(decodeEmbeddedCommand(startupScript)).toBe(command)
  })
})

function decodeEncodedCommand(arguments_: readonly string[]): string {
  const encodedCommandIndex = arguments_.indexOf('-EncodedCommand')
  expect(encodedCommandIndex).toBeGreaterThan(-1)
  return Buffer.from(arguments_[encodedCommandIndex + 1] ?? '', 'base64').toString('utf16le')
}

function decodeEmbeddedCommand(startupScript: string): string {
  const quotedCommand = startupScript.match(
    /Microsoft\.PowerShell\.Utility\\Invoke-Expression -Command '([\s\S]*)'$/u
  )?.[1]
  expect(quotedCommand).toBeDefined()
  return (quotedCommand ?? '').replaceAll("''", "'")
}
