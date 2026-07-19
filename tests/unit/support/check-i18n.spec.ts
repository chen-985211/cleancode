import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collectI18nViolations } from '../../../scripts/check-i18n.mjs'

describe('i18n quality gate', () => {
  it('flags hardcoded first-party copy in user-visible presentation positions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-i18n-'))

    try {
      const presentationDirectory = join(directory, 'src', 'presentation', 'app-shell')
      await mkdir(presentationDirectory, { recursive: true })
      await writeFile(
        join(presentationDirectory, 'Bad.tsx'),
        [
          'export function Bad() {',
          "  const notification = { title: 'Workflow failed', message: 'Try again later.' }",
          "  window.alert('Action failed')",
          '  return (',
          '    <section aria-label="Workspace overview">',
          '      <button>Run workflow</button>',
          '      <input placeholder="搜索项目" />',
          '    </section>',
          '  )',
          '}',
          ''
        ].join('\n')
      )

      const violations = collectI18nViolations({ cwd: directory })

      expect(violations).toHaveLength(6)
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ line: 2, rule: 'no-hardcoded-ui-property' }),
          expect.objectContaining({ line: 3, rule: 'no-hardcoded-dialog-copy' }),
          expect.objectContaining({ line: 5, rule: 'no-hardcoded-ui-attribute' }),
          expect.objectContaining({ line: 6, rule: 'no-hardcoded-jsx-text' }),
          expect.objectContaining({ line: 7, rule: 'no-hardcoded-ui-attribute' })
        ])
      )
      expect(violations.every(({ filePath }) => filePath.endsWith('/Bad.tsx'))).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('checks every production presentation root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-i18n-'))

    try {
      const contextPresentationDirectory = join(
        directory,
        'src',
        'contexts',
        'sample',
        'presentation'
      )
      const rendererDirectory = join(directory, 'src', 'platform', 'renderer-bootstrap')
      await mkdir(contextPresentationDirectory, { recursive: true })
      await mkdir(rendererDirectory, { recursive: true })
      await writeFile(
        join(contextPresentationDirectory, 'ContextView.tsx'),
        'export const ContextView = () => <p>Context message</p>\n'
      )
      await writeFile(
        join(rendererDirectory, 'RendererView.tsx'),
        'export const RendererView = () => <p>Renderer message</p>\n'
      )

      expect(collectI18nViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/contexts/sample/presentation/ContextView.tsx',
          rule: 'no-hardcoded-jsx-text'
        }),
        expect.objectContaining({
          filePath: 'src/platform/renderer-bootstrap/RendererView.tsx',
          rule: 'no-hardcoded-jsx-text'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows locale catalogs, translated values, and machine-facing literals', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-i18n-'))

    try {
      const presentationDirectory = join(directory, 'src', 'presentation', 'app-shell')
      const catalogDirectory = join(presentationDirectory, 'i18n', 'catalogs')
      await mkdir(catalogDirectory, { recursive: true })
      await writeFile(
        join(catalogDirectory, 'zh-CN.ts'),
        "export const zhCNMessages = { action: '运行流程', detail: 'Workflow detail' }\n"
      )
      await writeFile(
        join(presentationDirectory, 'Good.tsx'),
        [
          "const command = 'pnpm run dev'",
          "const status = 'waiting-for-project'",
          "const diagnostic = new Error('Renderer root element was not found.')",
          'const protocolOption = <option>HTTP</option>',
          'export function Good({ t, label, name }) {',
          '  return (',
          '    <button',
          '      className="workspace-action workspace-action--primary"',
          '      data-testid="workspace-action"',
          "      aria-label={t('toolbar.newTerminal')}",
          '      title={label}',
          '    >',
          '      {name}',
          '    </button>',
          '  )',
          '}',
          ''
        ].join('\n')
      )

      expect(collectI18nViolations({ cwd: directory })).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
