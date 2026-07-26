import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collectPortablePathViolations } from '../../../scripts/check-portable-paths.mjs'

describe('portable path quality gate', () => {
  it('rejects manual filesystem separators in path construction and assertions', async () => {
    const directory = await createFixtureRepository()

    try {
      await writeSourceFile(
        directory,
        'src/platform/Bad.ts',
        [
          'export function createCacheDirectory(rootDirectory: string) {',
          '  return `${rootDirectory}/cache`',
          '}',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'tests/unit/Bad.spec.ts',
        [
          "const developmentProfilesDirectory = '/application-data/profiles'",
          "const runtimeDataDirectory = '/application-data/profiles/profile-a'",
          'const windowsRuntimeDataDirectory = String.raw`C:\\ApplicationData\\profiles\\profile-a`',
          'expect(runtimeDataDirectory.startsWith(`${developmentProfilesDirectory}/`)).toBe(true)',
          'expect(runtimeDataDirectory).toMatch(/^\\/application-data\\/profiles\\//)',
          'expect(windowsRuntimeDataDirectory).toMatch(/^[A-Za-z]:\\\\ApplicationData\\\\profiles\\\\/)',
          ''
        ].join('\n')
      )

      expect(collectPortablePathViolations({ cwd: directory })).toEqual([
        {
          filePath: 'src/platform/Bad.ts',
          line: 2,
          rule: 'no-manual-path-separator',
          message: 'Compose filesystem paths with join/resolve or an explicit posix/win32 path API.'
        },
        expect.objectContaining({
          filePath: 'tests/unit/Bad.spec.ts',
          line: 4,
          rule: 'no-manual-path-separator'
        }),
        expect.objectContaining({
          filePath: 'tests/unit/Bad.spec.ts',
          line: 5,
          rule: 'no-platform-specific-path-regexp'
        }),
        expect.objectContaining({
          filePath: 'tests/unit/Bad.spec.ts',
          line: 6,
          rule: 'no-platform-specific-path-regexp'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects string concatenation with a path-like value and a literal separator', async () => {
    const directory = await createFixtureRepository()

    try {
      await writeSourceFile(
        directory,
        'src/platform/Bad.ts',
        [
          'export function createLogFile(outputDirectory: string) {',
          "  return outputDirectory + '/run.log'",
          '}',
          ''
        ].join('\n')
      )

      expect(collectPortablePathViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/platform/Bad.ts',
          line: 2,
          rule: 'no-manual-path-separator'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows path APIs, static fixtures, URLs, and explicitly normalized POSIX paths', async () => {
    const directory = await createFixtureRepository()

    try {
      await writeSourceFile(
        directory,
        'src/platform/Good.ts',
        [
          "import { join, posix, win32 } from 'node:path'",
          "export const staticFixture = '/application-data/profiles/profile-a'",
          "export const cacheDirectory = join('/application-data', 'cache')",
          "export const posixCache = posix.join('/application-data', 'cache')",
          "export const windowsCache = win32.join('C:\\\\ApplicationData', 'cache')",
          'export const endpoint = `${baseUrl}/api/workspaces`',
          'export function containsDirectory(directory: string, parentDirectory: string) {',
          "  const normalizedDirectory = directory.replaceAll('\\\\', '/')",
          '  return normalizedDirectory.startsWith(`${parentDirectory}/`)',
          '}',
          ''
        ].join('\n')
      )
      await writeSourceFile(
        directory,
        'tests/unit/Good.spec.ts',
        [
          "import { posix } from 'node:path'",
          'expect(posix.dirname(runtimeDataDirectory)).toBe(',
          "  posix.join('/application-data', 'profiles')",
          ')',
          'expect(posix.basename(runtimeDataDirectory)).toMatch(/^[a-f0-9]{24}$/)',
          ''
        ].join('\n')
      )

      expect(collectPortablePathViolations({ cwd: directory })).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

async function createFixtureRepository(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cleancode-portable-paths-'))
}

async function writeSourceFile(
  directory: string,
  filePath: string,
  content: string
): Promise<void> {
  const absolutePath = join(directory, filePath)
  await mkdir(join(absolutePath, '..'), { recursive: true })
  await writeFile(absolutePath, content)
}
