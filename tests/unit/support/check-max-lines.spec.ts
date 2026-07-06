import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectLineViolations,
  countTextLines,
  isCodeFile
} from '../../../scripts/check-max-lines.mjs'

describe('max lines quality gate', () => {
  it('counts text lines without treating a trailing newline as another line', () => {
    expect(countTextLines('')).toBe(0)
    expect(countTextLines('one')).toBe(1)
    expect(countTextLines('one\n')).toBe(1)
    expect(countTextLines('one\ntwo\n')).toBe(2)
  })

  it('only checks project code files', () => {
    expect(isCodeFile('src/presentation/app-shell/AppShell.tsx')).toBe(true)
    expect(isCodeFile('tests/unit/support/check-max-lines.spec.ts')).toBe(true)
    expect(isCodeFile('scripts/check-max-lines.mjs')).toBe(true)
    expect(isCodeFile('scripts/check-max-lines.d.mts')).toBe(true)
    expect(isCodeFile('docs/architecture.md')).toBe(false)
    expect(isCodeFile('pnpm-lock.yaml')).toBe(false)
  })

  it('reports changed code files that exceed the configured line limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-max-lines-'))

    try {
      await mkdir(join(directory, 'src'))
      await writeFile(join(directory, 'src/small.ts'), 'const value = 1\n')
      await writeFile(join(directory, 'src/large.ts'), ['a', 'b', 'c', 'd'].join('\n'))

      expect(
        collectLineViolations(['src/small.ts', 'src/large.ts'], {
          cwd: directory,
          maxLines: 3
        })
      ).toEqual([{ filePath: 'src/large.ts', lineCount: 4 }])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
