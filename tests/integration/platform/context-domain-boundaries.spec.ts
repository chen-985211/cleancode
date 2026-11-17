import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('context Domain dependency isolation', () => {
  it('discovers a new context and rejects its foreign Domain imports through the real CLI', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-context-boundaries-'))
    try {
      const sources: Record<string, string> = {
        'src/contexts/run/domain/errors/RunDomainError.ts': 'export class RunDomainError {}',
        'src/contexts/run/application/dto/RunSnapshot.ts':
          'export interface RunSnapshot { id: string }',
        'src/shared-kernel/domain/errors/AppError.ts': 'export class AppError {}',
        'src/contexts/future-context/domain/Owned.ts': 'export class Owned {}',
        'src/contexts/future-context/application/allowed.ts': [
          "import type { Owned } from '../domain/Owned'",
          "import type { RunSnapshot } from '../../run/application/dto/RunSnapshot'",
          "import type { AppError } from '../../../shared-kernel/domain/errors/AppError'",
          'export interface Allowed { owned: Owned; snapshot: RunSnapshot; error: AppError }'
        ].join('\n')
      }
      const layers = ['domain', 'application', 'infrastructure', 'presentation']
      for (const layer of layers) {
        sources[`src/contexts/future-context/${layer}/invalid.ts`] =
          "import type { RunDomainError } from '../../run/domain/errors/RunDomainError'; export type Invalid = RunDomainError"
      }
      for (const [modulePath, source] of Object.entries(sources)) {
        const target = join(directory, modulePath)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, source)
      }
      await writeFile(
        join(directory, '.dependency-cruiser.cjs'),
        await readFile(new URL('../../../.dependency-cruiser.cjs', import.meta.url))
      )
      await writeFile(
        join(directory, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext' } })
      )
      const cli = fileURLToPath(
        new URL('../../bin/dependency-cruise.mjs', import.meta.resolve('dependency-cruiser'))
      )
      const result = await new Promise<{ error: Error | null; stdout: string; stderr: string }>(
        (resolve) => {
          execFile(
            process.execPath,
            [cli, 'src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
            { cwd: directory, timeout: 20000 },
            (error, stdout, stderr) => resolve({ error, stdout, stderr })
          )
        }
      )
      expect(result.stdout, result.stderr).not.toBe('')
      const report = JSON.parse(result.stdout) as {
        summary: { violations: { from: string; to: string; rule: { name: string } }[] }
      }
      expect(result.error, result.stderr).toBeNull()
      expect(report.summary.violations).toEqual(
        expect.arrayContaining(
          layers.map((layer) =>
            expect.objectContaining({
              from: `src/contexts/future-context/${layer}/invalid.ts`,
              to: 'src/contexts/run/domain/errors/RunDomainError.ts',
              rule: expect.objectContaining({ name: 'no-foreign-domain-from-future-context' })
            })
          )
        )
      )
      expect(report.summary.violations).toHaveLength(layers.length)
      const failure = await new Promise<{ error: Error | null; stdout: string }>((resolve) => {
        execFile(
          process.execPath,
          [cli, 'src', '--config', '.dependency-cruiser.cjs'],
          { cwd: directory, timeout: 20000 },
          (error, stdout) => resolve({ error, stdout })
        )
      })
      expect(failure.error, failure.stdout).toMatchObject({ code: expect.any(Number) })
      expect(failure.error).not.toMatchObject({ code: 0 })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30000)
})
