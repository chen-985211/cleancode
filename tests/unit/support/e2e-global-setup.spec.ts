import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertPrebuiltE2eApplication,
  createE2eBuildInvocation,
  E2E_BUILD_ARTIFACTS
} from '../../support/e2eGlobalSetup'

describe('E2E global setup', () => {
  let rootDirectory: string | undefined

  afterEach(async () => {
    if (rootDirectory) {
      await rm(rootDirectory, { recursive: true, force: true })
    }
  })

  it('accepts a complete prebuilt application', async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cleancode-e2e-build-'))

    await Promise.all(
      E2E_BUILD_ARTIFACTS.map(async (artifact) => {
        const artifactPath = join(rootDirectory!, artifact)
        await mkdir(dirname(artifactPath), { recursive: true })
        await writeFile(artifactPath, '')
      })
    )

    await expect(assertPrebuiltE2eApplication(rootDirectory)).resolves.toBeUndefined()
  })

  it('fails closed when a required artifact is missing', async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cleancode-e2e-build-'))

    for (const artifact of E2E_BUILD_ARTIFACTS.slice(0, -1)) {
      const artifactPath = join(rootDirectory, artifact)
      await mkdir(dirname(artifactPath), { recursive: true })
      await writeFile(artifactPath, '')
    }

    await expect(assertPrebuiltE2eApplication(rootDirectory)).rejects.toThrow(
      'out/renderer/index.html'
    )
  })

  it('uses the Windows command interpreter when spawning pnpm', () => {
    expect(createE2eBuildInvocation('win32', 'C:\\Windows\\System32\\cmd.exe')).toEqual({
      executable: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', 'exec', 'electron-vite', 'build']
    })
    expect(createE2eBuildInvocation('linux')).toEqual({
      executable: 'pnpm',
      args: ['exec', 'electron-vite', 'build']
    })
  })
})
