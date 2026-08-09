import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import afterPack from '../../../scripts/after-pack.mjs'

describe('Windows node-pty packaging', () => {
  it.each([
    { arch: 1, architecture: 'x64' },
    { arch: 3, architecture: 'arm64' }
  ])(
    'places the bundled ConPTY runtime beside the rebuilt $architecture native module',
    async ({ arch, architecture }) => {
      const fixture = await createPackagingFixture(architecture)
      const nativeModuleDirectory = join(
        fixture.appOutDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'node-pty',
        'build',
        'Release'
      )
      const packagedPrebuildDirectory = join(
        fixture.appOutDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'node-pty',
        'prebuilds',
        `win32-${architecture}`
      )

      try {
        await writeFixtureFile(nativeModuleDirectory, 'conpty.node', 'rebuilt native module')
        await writeFixtureFile(packagedPrebuildDirectory, 'conpty.node', 'stale prebuild')

        await afterPack({
          appOutDir: fixture.appOutDir,
          arch,
          electronPlatformName: 'win32',
          packager: { projectDir: fixture.projectDirectory }
        })

        await expect(
          readFile(join(nativeModuleDirectory, 'conpty', 'conpty.dll'), 'utf8')
        ).resolves.toBe(`${architecture} conpty`)
        await expect(
          readFile(join(nativeModuleDirectory, 'conpty', 'OpenConsole.exe'), 'utf8')
        ).resolves.toBe(`${architecture} console`)
        await expect(access(packagedPrebuildDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await fixture.cleanup()
      }
    }
  )

  it('rejects a packaged prebuild when electron-builder did not produce a rebuilt module', async () => {
    const fixture = await createPackagingFixture('x64')
    const nativeModuleDirectory = join(
      fixture.appOutDir,
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'prebuilds',
      'win32-x64'
    )

    try {
      await writeFixtureFile(nativeModuleDirectory, 'conpty.node', 'prebuilt native module')

      await expect(
        afterPack({
          appOutDir: fixture.appOutDir,
          arch: 1,
          electronPlatformName: 'win32',
          packager: { projectDir: fixture.projectDirectory }
        })
      ).rejects.toThrow('rebuilt node-pty conpty.node was not found')
    } finally {
      await fixture.cleanup()
    }
  })

  it('fails packaging when no loadable Windows ConPTY native module was packaged', async () => {
    const fixture = await createPackagingFixture('x64')

    try {
      await expect(
        afterPack({
          appOutDir: fixture.appOutDir,
          arch: 1,
          electronPlatformName: 'win32',
          packager: { projectDir: fixture.projectDirectory }
        })
      ).rejects.toThrow('Packaged rebuilt node-pty conpty.node was not found')
    } finally {
      await fixture.cleanup()
    }
  })

  it('leaves non-Windows packages unchanged', async () => {
    const fixture = await createPackagingFixture('x64')

    try {
      await expect(
        afterPack({
          appOutDir: fixture.appOutDir,
          arch: 1,
          electronPlatformName: 'darwin',
          packager: { projectDir: fixture.projectDirectory }
        })
      ).resolves.toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })
})

async function createPackagingFixture(architecture: string): Promise<{
  readonly appOutDir: string
  readonly cleanup: () => Promise<void>
  readonly projectDirectory: string
}> {
  const directory = await mkdtemp(join(tmpdir(), 'cleancode-node-pty-packaging-'))
  const projectDirectory = join(directory, 'project')
  const appOutDir = join(directory, 'win-unpacked')
  const sourceDirectory = join(
    projectDirectory,
    'node_modules',
    'node-pty',
    'third_party',
    'conpty',
    '1.23.251008001',
    `win10-${architecture}`
  )

  await writeFixtureFile(sourceDirectory, 'conpty.dll', `${architecture} conpty`)
  await writeFixtureFile(sourceDirectory, 'OpenConsole.exe', `${architecture} console`)

  return {
    appOutDir,
    cleanup: () => rm(directory, { recursive: true, force: true }),
    projectDirectory
  }
}

async function writeFixtureFile(
  directory: string,
  fileName: string,
  contents: string
): Promise<void> {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, fileName), contents, 'utf8')
}
