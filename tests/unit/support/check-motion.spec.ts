import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { collectMotionViolations } from '../../../scripts/check-motion.mjs'

describe('motion quality gate', () => {
  it('flags raw timing values and curves in ordinary production CSS motion declarations', async () => {
    const directory = await createFixture()

    try {
      await writeCss(
        directory,
        'src/presentation/app-shell/styles/bad.css',
        [
          '.raw-transition { transition: color 150ms ease; }',
          '.raw-animation { animation: raw-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }',
          '.raw-delay { animation-delay: 160ms; }',
          '.raw-linear { animation: spin var(--cc-motion-duration-feedback) linear infinite; }'
        ].join('\n')
      )

      expect(await collectMotionViolations({ cwd: directory })).toEqual([
        expect.objectContaining({ line: 1, rule: 'raw-motion-timing' }),
        expect.objectContaining({ line: 2, rule: 'raw-motion-timing' }),
        expect.objectContaining({ line: 3, rule: 'raw-motion-timing' }),
        expect.objectContaining({ line: 4, rule: 'raw-motion-timing' })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows semantic tokens, a tokenized spinner, and disabled motion', async () => {
    const directory = await createFixture()

    try {
      await writeCss(
        directory,
        'src/presentation/app-shell/styles/good.css',
        [
          '.feedback {',
          '  transition: color var(--cc-motion-duration-feedback) var(--cc-easing-standard);',
          '}',
          '.surface {',
          '  animation: surface-in var(--cc-motion-duration-surface) var(--cc-easing-enter);',
          '  animation-delay: var(--cc-motion-duration-surface);',
          '}',
          '.spinner {',
          '  animation: spin var(--cc-motion-duration-spinner) linear infinite;',
          '}',
          '.disabled { transition: none; animation: none; }'
        ].join('\n')
      )

      expect(await collectMotionViolations({ cwd: directory })).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows only registered named owners and the renderer reduced-motion clamp', async () => {
    const directory = await createFixture()

    try {
      await writeCss(
        directory,
        'src/presentation/app-shell/styles/base.css',
        [
          '.app-shell {',
          '  /* cc-motion-owner: app-shell-layout */',
          '  transition: grid-template-columns 180ms ease;',
          '}',
          '.unknown {',
          '  /* cc-motion-owner: unknown-owner */',
          '  transition: width 180ms ease;',
          '}'
        ].join('\n')
      )
      await writeCss(
        directory,
        'src/platform/renderer-bootstrap/renderer.css',
        [
          '@media (prefers-reduced-motion: reduce) {',
          '  * {',
          '    transition-duration: 0.01ms !important;',
          '    animation-duration: 0.01ms !important;',
          '  }',
          '}'
        ].join('\n')
      )

      expect(await collectMotionViolations({ cwd: directory })).toEqual([
        expect.objectContaining({ filePath: 'src/presentation/app-shell/styles/base.css', line: 7 })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the checked-in production CSS free from unnamed raw motion values', async () => {
    expect(await collectMotionViolations()).toEqual([])
  })
})

async function createFixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cleancode-motion-'))
}

async function writeCss(directory: string, filePath: string, source: string): Promise<void> {
  const absolutePath = join(directory, filePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${source}\n`)
}
