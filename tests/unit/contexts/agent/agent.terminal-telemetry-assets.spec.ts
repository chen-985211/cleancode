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
      expect(JSON.parse(await readFile(assets.launchSpecsPath, 'utf8'))).toMatchObject({
        providers: {
          'claude-code': { commandName: 'claude', statusTracking: 'full' },
          codex: { commandName: 'codex', statusTracking: 'completion_only' },
          gemini: { commandName: 'gemini', statusTracking: 'full' },
          opencode: { commandName: 'opencode', statusTracking: 'full' }
        }
      })
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
      expect(commandShim).toContain('set "ELECTRON_RUN_AS_NODE=1"')
      expect(commandShim).toContain('set "ELECTRON_NO_ATTACH_CONSOLE="')
      expect(commandShim).toContain('shim-launcher.mjs')
      expect(powerShellShim).toContain('$previousElectronRunAsNode')
      expect(powerShellShim).toContain('$previousElectronNoAttachConsole')
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
      expect(shimLauncher).toContain('windowsVerbatimArguments: true')
      expect(shimLauncher).toContain('escapeWindowsArgument(arg, true)')
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
