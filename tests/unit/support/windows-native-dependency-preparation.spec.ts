import { join } from 'node:path'

import {
  resolveNativeDependencyPreparationInvocation,
  resolveNodePtyNativeFallbackDirectories,
  resolveNodePtyNativeProbeInvocation
} from '../../../scripts/prepare-native-dependencies.mjs'

describe('native dependency preparation', () => {
  it.each(['darwin', 'linux'])('does not rebuild native dependencies on %s', (platform) => {
    expect(
      resolveNativeDependencyPreparationInvocation({
        nodeExecutable: '/usr/local/bin/node',
        packageManagerExecutable: '/opt/pnpm/pnpm.cjs',
        platform
      })
    ).toBeNull()
  })

  it('uses the active pnpm runtime to rebuild patched dependencies for Electron on Windows', () => {
    expect(
      resolveNativeDependencyPreparationInvocation({
        nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
        packageManagerExecutable: 'C:\\pnpm\\pnpm.cjs',
        platform: 'win32'
      })
    ).toEqual({
      args: ['C:\\pnpm\\pnpm.cjs', 'exec', 'electron-builder', 'install-app-deps'],
      command: 'C:\\Program Files\\nodejs\\node.exe'
    })
  })

  it('fails closed when the package manager entry is unavailable on Windows', () => {
    expect(() =>
      resolveNativeDependencyPreparationInvocation({
        nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
        packageManagerExecutable: undefined,
        platform: 'win32'
      })
    ).toThrow('npm_execpath')
  })

  it('removes native fallback directories for the current Windows architecture', () => {
    expect(
      resolveNodePtyNativeFallbackDirectories({
        architecture: 'x64',
        projectDirectory: '/project'
      })
    ).toEqual([
      join('/project', 'node_modules', 'node-pty', 'build', 'Debug'),
      join('/project', 'node_modules', 'node-pty', 'prebuilds', 'win32-x64')
    ])
  })

  it('uses the target Electron runtime for the rebuilt native module probe', () => {
    expect(
      resolveNodePtyNativeProbeInvocation({
        electronExecutable: 'C:\\runtime\\electron.exe',
        probePath: 'C:\\project\\scripts\\verify-node-pty-native.mjs'
      })
    ).toEqual({
      args: ['C:\\project\\scripts\\verify-node-pty-native.mjs'],
      command: 'C:\\runtime\\electron.exe'
    })
  })
})
