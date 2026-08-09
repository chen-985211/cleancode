import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

describe('Windows terminal Provider runtime uninstall contract', () => {
  it('cleans relocated hosts only for a real uninstall, never during an update', async () => {
    const projectDirectory = process.cwd()
    const [builderConfiguration, uninstallScript] = await Promise.all([
      readFile(join(projectDirectory, 'electron-builder.yml'), 'utf8'),
      readFile(join(projectDirectory, 'scripts', 'windows-terminal-provider-uninstall.nsh'), 'utf8')
    ])

    expect(builderConfiguration).toContain(
      'include: ./scripts/windows-terminal-provider-uninstall.nsh'
    )
    expect(uninstallScript).toContain('!macro customUnInstall')
    expect(uninstallScript).toContain('!macro customInstallMode')
    expect(uninstallScript).toContain('$hasPerMachineInstallation == "1"')
    expect(uninstallScript).toContain('StrCpy $isForceMachineInstall "1"')
    expect(uninstallScript).toContain('StrCpy $isForceCurrentInstall "1"')
    expect(uninstallScript).toContain('${ifNot} ${isUpdated}')
    expect(uninstallScript).toContain('taskkill /T /F /IM cleancode-terminal-provider.exe')
    expect(uninstallScript).toContain('SetShellVarContext current')
    expect(uninstallScript).toContain('RMDir /r "$LOCALAPPDATA\\CleanCode\\terminal-provider-host"')
    expect(uninstallScript).not.toContain('ReadEnvStr')
  })
})
