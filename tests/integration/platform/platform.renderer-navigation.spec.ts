import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import ts from 'typescript'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)

describe('Electron renderer navigation', () => {
  it('keeps development and packaged page reloads inside Electron while opening external links', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-navigation-'))
    try {
      const source = await readFile(
        new URL(
          '../../../src/platform/electron-main/electronExternalNavigationPolicy.ts',
          import.meta.url
        ),
        'utf8'
      )
      const policyPath = join(directory, 'policy.cjs')
      await writeFile(
        policyPath,
        ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
        }).outputText
      )
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const { stdout } = await execFileAsync(
        require('electron') as string,
        [
          fileURLToPath(new URL('../../fixtures/platform/electronNavigation.mjs', import.meta.url)),
          policyPath,
          directory,
          // Match Playwright's Electron launcher on Linux runners without a setuid sandbox.
          // This flag is confined to the isolated fixture process.
          ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
        ],
        { env, timeout: 25_000, maxBuffer: 1024 * 1024 }
      )
      const report = JSON.parse(stdout.trim())

      expect(report).toEqual([
        { mode: 'development', reload: 'loaded-in-electron', external: 'opened-externally' },
        { mode: 'packaged', reload: 'loaded-in-electron', external: 'opened-externally' }
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
