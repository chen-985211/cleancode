import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  collectTerminalPaletteViolations,
  collectThemeViolations,
  createTerminalPaletteModule
} from '../../../scripts/check-theme.mjs'

describe('theme quality gate', () => {
  it('flags color literals in production UI CSS, TSX, and SVG files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-theme-'))

    try {
      await mkdir(join(directory, 'src', 'presentation', 'app-shell'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'presentation', 'app-shell', 'bad.css'),
        '.bad { color: #ffffff; box-shadow: 0 0 2px rgb(0 0 0 / 20%); }\n'
      )
      await writeFile(
        join(directory, 'src', 'presentation', 'app-shell', 'bad.tsx'),
        "export const bad = <div style={{ color: 'hsl(0 0% 100%)' }} />\n"
      )
      await writeFile(
        join(directory, 'src', 'presentation', 'app-shell', 'bad.svg'),
        '<svg><path fill="white" stroke="#000" /></svg>\n'
      )

      expect(await collectThemeViolations({ cwd: directory })).toEqual([
        expect.objectContaining({ filePath: 'src/presentation/app-shell/bad.css', line: 1 }),
        expect.objectContaining({ filePath: 'src/presentation/app-shell/bad.svg', line: 1 }),
        expect.objectContaining({ filePath: 'src/presentation/app-shell/bad.tsx', line: 1 })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows centralized theme declarations and semantic theme values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-theme-'))

    try {
      await mkdir(join(directory, 'src', 'presentation', 'app-shell', 'styles'), {
        recursive: true
      })
      await writeFile(
        join(directory, 'src', 'presentation', 'app-shell', 'styles', 'theme.css'),
        ':root { --cc-surface: #ffffff; --cc-overlay: oklch(0% 0 0 / 40%); }\n'
      )
      await writeFile(
        join(directory, 'src', 'presentation', 'app-shell', 'good.css'),
        '.good { color: var(--cc-foreground); background: transparent; }\n'
      )
      await writeFile(
        join(directory, 'src', 'presentation', 'app-shell', 'palette.svg'),
        '<svg><path fill="none" stroke="currentColor" /></svg>\n'
      )

      expect(await collectThemeViolations({ cwd: directory })).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('generates the canonical terminal palette deterministically from the theme stylesheet', async () => {
    const source = await readFile(
      join(process.cwd(), 'src', 'presentation', 'app-shell', 'styles', 'theme.css'),
      'utf8'
    )

    const generated = createTerminalPaletteModule(source)

    expect(generated).toContain("background: '#ffffff'")
    expect(generated).toContain("foreground: '#d6dee8'")
    expect(generated).toContain("selectionBackground: '#2d415c'")
    expect(createTerminalPaletteModule(source)).toBe(generated)
    expect(await collectTerminalPaletteViolations()).toEqual([])
  })

  it('flags a missing or stale generated terminal palette', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-theme-palette-'))

    try {
      const themeDirectory = join(directory, 'src', 'presentation', 'app-shell', 'styles')
      const generatedDirectory = join(directory, 'src', 'contexts', 'run', 'application', 'dto')
      await mkdir(themeDirectory, { recursive: true })
      await mkdir(generatedDirectory, { recursive: true })
      await writeFile(
        join(themeDirectory, 'theme.css'),
        await readFile(
          join(process.cwd(), 'src', 'presentation', 'app-shell', 'styles', 'theme.css'),
          'utf8'
        )
      )

      expect(await collectTerminalPaletteViolations({ cwd: directory })).toEqual([
        expect.objectContaining({ rule: 'terminal-palette-generated' })
      ])

      await writeFile(join(generatedDirectory, 'TerminalPalette.generated.ts'), '// stale\n')

      expect(await collectTerminalPaletteViolations({ cwd: directory })).toEqual([
        expect.objectContaining({ rule: 'terminal-palette-generated' })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a runtime CSS alias that drifts from its source-theme palette', async () => {
    const source = await readFile(
      join(process.cwd(), 'src', 'presentation', 'app-shell', 'styles', 'theme.css'),
      'utf8'
    )
    const driftedSource = source.replace(
      '--cc-terminal-background: var(--cc-terminal-dark-background);',
      '--cc-terminal-background: var(--cc-terminal-light-background);'
    )

    expect(() => createTerminalPaletteModule(driftedSource)).toThrow(
      'Expected exactly one light terminal background alias.'
    )
  })
})
