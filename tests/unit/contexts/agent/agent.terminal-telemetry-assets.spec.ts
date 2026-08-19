import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { TerminalAgentTelemetryAssetStore } from '../../../../src/contexts/agent/infrastructure/terminal-activity/TerminalAgentTelemetryAssetStore'

describe('terminal Agent telemetry assets', () => {
  it('publishes stable provider shims, hook assets, and a replaceable gateway manifest', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-telemetry-assets-'))
    try {
      const store = new TerminalAgentTelemetryAssetStore({
        platform: 'darwin',
        runtimeExecutable: process.execPath,
        stateDirectory
      })
      const assets = await store.ensure()
      await store.publishGateway('http://127.0.0.1:43121/agent-activity')

      expect(assets.rootDirectory).toBe(join(stateDirectory, 'agent-activity'))
      expect(assets.shimDirectory).toBe(join(assets.rootDirectory, 'assets-v1', 'bin'))
      expect(JSON.parse(await readFile(assets.gatewayManifestPath, 'utf8'))).toEqual({
        url: 'http://127.0.0.1:43121/agent-activity'
      })
      for (const commandName of ['claude', 'codex', 'gemini', 'opencode']) {
        const shimPath = join(assets.shimDirectory, commandName)
        await access(shimPath, constants.X_OK)
        expect(await readFile(shimPath, 'utf8')).toContain('shim-launcher.mjs')
      }
      const launchSpecs = JSON.parse(await readFile(assets.launchSpecsPath, 'utf8'))
      expect(launchSpecs).toMatchObject({
        providers: {
          'claude-code': { commandName: 'claude', statusTracking: 'full' },
          codex: {
            commandName: 'codex',
            statusTracking: 'completion_only',
            windowsConsoleThemeProbe: true
          },
          gemini: { commandName: 'gemini', statusTracking: 'full' },
          opencode: { commandName: 'opencode', statusTracking: 'full' }
        }
      })
      for (const providerId of ['claude-code', 'gemini', 'opencode']) {
        expect(launchSpecs.providers[providerId].windowsConsoleThemeProbe).toBeUndefined()
      }
      expect(
        JSON.parse(
          await readFile(join(assets.rootDirectory, 'assets-v1', 'claude-settings.json'), 'utf8')
        )
      ).toMatchObject({ hooks: { PreToolUse: expect.any(Array) } })
      const hookRelay = await readFile(assets.hookRelayPath, 'utf8')
      expect(hookRelay).not.toContain('CLEANCODE_CLAUDE_HOOK_TOKEN')
      expect(hookRelay).toContain('signal: timeout.signal')
      expect(
        await readFile(join(assets.rootDirectory, 'assets-v1', 'opencode-plugin.mjs'), 'utf8')
      ).toContain('signal: timeout.signal')
      expect(await readFile(assets.shellLauncherPath, 'utf8')).toContain(
        'CLEANCODE_AGENT_ACTIVITY_BASH_RC'
      )
      expect(await readFile(assets.bashRcPath, 'utf8')).toContain(
        'CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY${PATH:+:$PATH}'
      )
      expect(await readFile(join(assets.zshDotDirectory, '.zshenv'), 'utf8')).toContain(
        'CLEANCODE_AGENT_ACTIVITY_ORIGINAL_ZDOTDIR'
      )
      expect(await readFile(join(assets.zshDotDirectory, '.zshrc'), 'utf8')).toContain(
        'CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY${PATH:+:$PATH}'
      )
      if (process.platform !== 'win32') {
        expect((await stat(assets.gatewayManifestPath)).mode & 0o777).toBe(0o600)
      }

      await store.publishGateway('http://127.0.0.1:43122/agent-activity')
      expect(JSON.parse(await readFile(assets.gatewayManifestPath, 'utf8'))).toEqual({
        url: 'http://127.0.0.1:43122/agent-activity'
      })
      expect((await store.ensure()).rootDirectory).toBe(assets.rootDirectory)
    } finally {
      await rm(stateDirectory, { force: true, recursive: true })
    }
  })

  it('materializes Windows command and PowerShell shims without mutating the parent environment', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-telemetry-win-'))
    const previousElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
    try {
      const store = new TerminalAgentTelemetryAssetStore({
        platform: 'win32',
        runtimeExecutable: 'C:\\CleanCode\\CleanCode.exe',
        stateDirectory
      })
      const assets = await store.ensure()

      const commandShim = await readFile(join(assets.shimDirectory, 'codex.cmd'), 'utf8')
      const powerShellShim = await readFile(join(assets.shimDirectory, 'codex.ps1'), 'utf8')
      expect(commandShim).toContain('powershell.exe -NoLogo -NoProfile')
      expect(commandShim).toContain('codex.ps1')
      expect(commandShim).not.toContain('CleanCode.exe')
      expect(powerShellShim).toContain('$previousElectronRunAsNode')
      expect(powerShellShim).toContain('$previousElectronNoAttachConsole')
      expect(powerShellShim).toContain('$planPath = [IO.Path]::GetTempFileName()')
      expect(powerShellShim).toContain('"--prepare-windows"')
      expect(powerShellShim).toContain('Start-Process')
      expect(powerShellShim).toContain('-NoNewWindow -PassThru -Wait')
      expect(powerShellShim).toContain('Get-Content -LiteralPath $planPath -Raw')
      expect(powerShellShim).toContain('$providerArguments = @($plan.arguments)')
      expect(powerShellShim).toContain('& $providerExecutable @providerArguments')
      expect(powerShellShim).toContain('$plan.windowsConsoleThemeProbe -eq $true')
      expect(powerShellShim).toContain('$env:CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN')
      expect(powerShellShim).toContain('$env:CLEANCODE_TERMINAL_SOURCE_THEME')
      expect(powerShellShim).toContain(
        "[Console]::Write(([char]27) + ']633;CLEANCODE_OUTPUT_CONTROL:' + $terminalOutputControlToken + ':' + $phase + ([char]7))"
      )
      expect(powerShellShim).toContain("-cmatch '^[0-9a-f]{48}$'")
      expect(powerShellShim).toContain('[Console]::ForegroundColor = [ConsoleColor]::Black')
      expect(powerShellShim).toContain('[Console]::BackgroundColor = [ConsoleColor]::White')
      expect(powerShellShim).toContain('[Console]::ForegroundColor = [ConsoleColor]::Gray')
      expect(powerShellShim).toContain('[Console]::BackgroundColor = [ConsoleColor]::Black')
      const prepareBeginIndex = powerShellShim.indexOf("Write-CleancodeOutputControlSpan 'begin'")
      const setForegroundIndex = powerShellShim.indexOf('[Console]::ForegroundColor =')
      const prepareEndIndex = powerShellShim.indexOf("Write-CleancodeOutputControlSpan 'end'")
      const providerInvocationIndex = powerShellShim.indexOf(
        '& $providerExecutable @providerArguments'
      )
      const providerCleanupTryIndex = powerShellShim.indexOf(
        '    try {\r\n      if ($consoleThemeControlEnabled)'
      )
      const restoreBeginIndex = powerShellShim.indexOf(
        "Write-CleancodeOutputControlSpan 'begin'",
        prepareBeginIndex + 1
      )
      const resetRenditionIndex = powerShellShim.indexOf("[Console]::Write(([char]27) + '[0m')")
      const captureExitCodeIndex = powerShellShim.indexOf(
        'if ($providerInvoked -and ($null -ne $LASTEXITCODE)) { $exitCode = $LASTEXITCODE }'
      )
      const restoreForegroundIndex = powerShellShim.indexOf(
        '[Console]::ForegroundColor = $previousConsoleForegroundColor'
      )
      const restoreEndIndex = powerShellShim.indexOf(
        "Write-CleancodeOutputControlSpan 'end'",
        prepareEndIndex + 1
      )
      expect(prepareBeginIndex).toBeGreaterThan(-1)
      expect(providerCleanupTryIndex).toBeGreaterThan(-1)
      expect(prepareBeginIndex).toBeGreaterThan(providerCleanupTryIndex)
      expect(setForegroundIndex).toBeGreaterThan(prepareBeginIndex)
      expect(prepareEndIndex).toBeGreaterThan(setForegroundIndex)
      expect(providerInvocationIndex).toBeGreaterThan(prepareEndIndex)
      expect(captureExitCodeIndex).toBeGreaterThan(providerInvocationIndex)
      expect(resetRenditionIndex).toBeGreaterThan(captureExitCodeIndex)
      expect(restoreBeginIndex).toBeGreaterThan(resetRenditionIndex)
      expect(restoreForegroundIndex).toBeGreaterThan(restoreBeginIndex)
      expect(restoreEndIndex).toBeGreaterThan(restoreForegroundIndex)
      expect(powerShellShim).toContain(
        "try { Write-CleancodeOutputControlSpan 'begin'; $restoreSpanStarted = $true } catch {}\r\n        try {\r\n          if ($restoreConsoleForegroundColor)"
      )
      const removePrivateEnvironmentIndex = powerShellShim.indexOf(
        'Remove-Item Env:CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN'
      )
      const restorePrivateEnvironmentIndex = powerShellShim.indexOf(
        '$env:CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN = $terminalOutputControlToken'
      )
      expect(removePrivateEnvironmentIndex).toBeLessThan(providerInvocationIndex)
      expect(restorePrivateEnvironmentIndex).toBeGreaterThan(providerInvocationIndex)
      expect(powerShellShim).toContain('"--complete-windows"')
      expect(powerShellShim).toContain(
        'Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue'
      )
      expect(powerShellShim).toContain('Remove-Item Env:ELECTRON_RUN_AS_NODE')
      const shimLauncher = await readFile(
        join(assets.rootDirectory, 'assets-v1', 'shim-launcher.mjs'),
        'utf8'
      )
      expect(shimLauncher).not.toContain('shell: true')
      expect(shimLauncher).not.toContain('spawnSync')
      expect(shimLauncher).toContain('process.on(signal, handler)')
      expect(shimLauncher).toContain("child.kill('SIGKILL')")
      expect(shimLauncher).toContain(
        "spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f']"
      )
      expect(shimLauncher).toContain('gracefulSignalTimeoutMs = 750')
      expect(shimLauncher).toContain('forcedExitTimeoutMs = 500')
      expect(shimLauncher).toContain("type: 'invocation_exited'")
      expect(shimLauncher).toContain("operation === '--prepare-windows'")
      expect(shimLauncher).toContain("operation === '--complete-windows'")
      expect(shimLauncher).toContain(
        '...(launch.spec.windowsConsoleThemeProbe === true ? { windowsConsoleThemeProbe: true } : {})'
      )
      expect(shimLauncher).toContain("['.PS1', ...String(process.env.PATHEXT")
      expect(shimLauncher).not.toContain("openSync('CONIN$', 'r')")
      expect(
        await readFile(join(assets.rootDirectory, 'assets-v1', 'hook-relay.cmd'), 'utf8')
      ).toContain('hook-relay.mjs')
      expect(process.env.ELECTRON_RUN_AS_NODE).toBe(previousElectronRunAsNode)
    } finally {
      await rm(stateDirectory, { force: true, recursive: true })
    }
  })

  it('retries materialization after a failed attempt instead of caching the rejection', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-telemetry-retry-'))
    const blockingPath = join(stateDirectory, 'agent-activity')
    try {
      await writeFile(blockingPath, 'not a directory')
      const store = new TerminalAgentTelemetryAssetStore({
        platform: 'darwin',
        runtimeExecutable: process.execPath,
        stateDirectory
      })

      await expect(store.ensure()).rejects.toBeInstanceOf(Error)
      await rm(blockingPath, { force: true })

      await expect(store.ensure()).resolves.toMatchObject({
        rootDirectory: blockingPath
      })
    } finally {
      await rm(stateDirectory, { force: true, recursive: true })
    }
  })
})
