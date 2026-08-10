import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  exportWindowsNodePtyNativeArtifact,
  restoreWindowsNodePtyNativeArtifact
} from '../../../scripts/windows-node-pty-native-artifact.mjs'

describe('Windows node-pty native artifact', () => {
  it('exports the rebuilt Electron native closure with an exact runtime manifest', async () => {
    const fixture = await createNativeArtifactFixture()

    try {
      await exportWindowsNodePtyNativeArtifact({
        architecture: 'x64',
        artifactDirectory: fixture.artifactDirectory,
        platform: 'win32',
        projectDirectory: fixture.sourceProjectDirectory
      })

      await expect(
        readFile(join(fixture.artifactDirectory, 'Release', 'conpty.node'), 'utf8')
      ).resolves.toBe('rebuilt conpty')
      await expect(
        readFile(join(fixture.artifactDirectory, 'Release', 'conpty', 'conpty.dll'), 'utf8')
      ).resolves.toBe('bundled conpty runtime')
      await expect(
        readFile(join(fixture.artifactDirectory, 'manifest.json'), 'utf8').then(JSON.parse)
      ).resolves.toEqual({
        architecture: 'x64',
        electronVersion: '43.0.0',
        nodePtyVersion: '1.1.0',
        platform: 'win32',
        schemaVersion: 1
      })
    } finally {
      await fixture.cleanup()
    }
  })

  it('restores the complete Release directory and removes stale native output', async () => {
    const fixture = await createNativeArtifactFixture()

    try {
      await exportWindowsNodePtyNativeArtifact({
        architecture: 'x64',
        artifactDirectory: fixture.artifactDirectory,
        platform: 'win32',
        projectDirectory: fixture.sourceProjectDirectory
      })
      await writeFixtureFile(
        join(fixture.destinationProjectDirectory, 'node_modules', 'node-pty', 'build', 'Release'),
        'stale.node',
        'stale native output'
      )

      await restoreWindowsNodePtyNativeArtifact({
        architecture: 'x64',
        artifactDirectory: fixture.artifactDirectory,
        platform: 'win32',
        projectDirectory: fixture.destinationProjectDirectory
      })

      await expect(
        readFile(
          join(
            fixture.destinationProjectDirectory,
            'node_modules',
            'node-pty',
            'build',
            'Release',
            'conpty.node'
          ),
          'utf8'
        )
      ).resolves.toBe('rebuilt conpty')
      await expect(
        access(
          join(
            fixture.destinationProjectDirectory,
            'node_modules',
            'node-pty',
            'build',
            'Release',
            'stale.node'
          )
        )
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fixture.cleanup()
    }
  })

  it('rejects an artifact built for a different Electron runtime', async () => {
    const fixture = await createNativeArtifactFixture()

    try {
      await exportWindowsNodePtyNativeArtifact({
        architecture: 'x64',
        artifactDirectory: fixture.artifactDirectory,
        platform: 'win32',
        projectDirectory: fixture.sourceProjectDirectory
      })
      await writePackageVersion(fixture.destinationProjectDirectory, 'electron', '44.0.0')

      await expect(
        restoreWindowsNodePtyNativeArtifact({
          architecture: 'x64',
          artifactDirectory: fixture.artifactDirectory,
          platform: 'win32',
          projectDirectory: fixture.destinationProjectDirectory
        })
      ).rejects.toThrow('Electron 43.0.0')
    } finally {
      await fixture.cleanup()
    }
  })

  it('fails closed when the rebuilt ConPTY module is missing', async () => {
    const fixture = await createNativeArtifactFixture({ includeNativeModule: false })

    try {
      await expect(
        exportWindowsNodePtyNativeArtifact({
          architecture: 'x64',
          artifactDirectory: fixture.artifactDirectory,
          platform: 'win32',
          projectDirectory: fixture.sourceProjectDirectory
        })
      ).rejects.toThrow('conpty.node')
    } finally {
      await fixture.cleanup()
    }
  })

  it.each([
    { architecture: 'x64', platform: 'darwin' },
    { architecture: 'ia32', platform: 'win32' }
  ])(
    'rejects unsupported artifact target $platform/$architecture',
    async ({ architecture, platform }) => {
      const fixture = await createNativeArtifactFixture()

      try {
        await expect(
          exportWindowsNodePtyNativeArtifact({
            architecture,
            artifactDirectory: fixture.artifactDirectory,
            platform,
            projectDirectory: fixture.sourceProjectDirectory
          })
        ).rejects.toThrow('Windows node-pty native artifact')
      } finally {
        await fixture.cleanup()
      }
    }
  )
})

async function createNativeArtifactFixture({
  includeNativeModule = true
}: { readonly includeNativeModule?: boolean } = {}): Promise<{
  readonly artifactDirectory: string
  readonly cleanup: () => Promise<void>
  readonly destinationProjectDirectory: string
  readonly sourceProjectDirectory: string
}> {
  const directory = await mkdtemp(join(tmpdir(), 'cleancode-node-pty-native-artifact-'))
  const artifactDirectory = join(directory, 'artifact')
  const sourceProjectDirectory = join(directory, 'source-project')
  const destinationProjectDirectory = join(directory, 'destination-project')

  await Promise.all(
    [sourceProjectDirectory, destinationProjectDirectory].flatMap((projectDirectory) => [
      writePackageVersion(projectDirectory, 'electron', '43.0.0'),
      writePackageVersion(projectDirectory, 'node-pty', '1.1.0')
    ])
  )

  const releaseDirectory = join(
    sourceProjectDirectory,
    'node_modules',
    'node-pty',
    'build',
    'Release'
  )
  if (includeNativeModule) {
    await writeFixtureFile(releaseDirectory, 'conpty.node', 'rebuilt conpty')
  }
  await writeFixtureFile(join(releaseDirectory, 'conpty'), 'conpty.dll', 'bundled conpty runtime')
  await writeFixtureFile(
    join(releaseDirectory, 'conpty'),
    'OpenConsole.exe',
    'bundled console runtime'
  )

  return {
    artifactDirectory,
    cleanup: () => rm(directory, { force: true, recursive: true }),
    destinationProjectDirectory,
    sourceProjectDirectory
  }
}

async function writePackageVersion(
  projectDirectory: string,
  packageName: string,
  version: string
): Promise<void> {
  await writeFixtureFile(
    join(projectDirectory, 'node_modules', packageName),
    'package.json',
    JSON.stringify({ name: packageName, version })
  )
}

async function writeFixtureFile(
  directory: string,
  fileName: string,
  contents: string
): Promise<void> {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, fileName), contents, 'utf8')
}
