import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectDocumentationViolations } from '../../../scripts/check-docs.mjs'

describe('documentation quality gate', () => {
  it('accepts an indexed document tree with valid local links and heading anchors', async () => {
    await withDocumentationFixture(
      {
        'README.md': '# Project\n\nSee the [documentation center](docs/README.md).\n',
        'AGENTS.md': '# Agent entry\n\nRead the [documentation center](docs/README.md).\n',
        'docs/README.md': '# Documentation\n\n- [Sample guide](contexts/sample/guide.md#details)\n',
        'docs/contexts/sample/guide.md':
          '# Sample guide\n\n## Details\n\nThe documented behavior.\n'
      },
      async (cwd) => {
        expect(collectDocumentationViolations({ cwd })).toEqual([])
      }
    )
  })

  it('reports missing local files and missing Markdown heading anchors', async () => {
    await withDocumentationFixture(
      {
        'README.md': '# Project\n',
        'AGENTS.md': '# Agent entry\n',
        'docs/README.md': [
          '# Documentation',
          '',
          '- [Missing document](contexts/sample/missing.md)',
          '- [Missing heading](contexts/sample/guide.md#not-present)',
          ''
        ].join('\n'),
        'docs/contexts/sample/guide.md': '# Sample guide\n\n## Present heading\n'
      },
      async (cwd) => {
        const violations = collectDocumentationViolations({ cwd })

        expect(violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              filePath: 'docs/README.md',
              rule: 'broken-local-link'
            }),
            expect.objectContaining({
              filePath: 'docs/README.md',
              rule: 'missing-heading-anchor'
            })
          ])
        )
      }
    )
  })

  it.each(['README_ZH.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CLAUDE.md'])(
    'checks local links from root document %s',
    async (rootDocument) => {
      await withDocumentationFixture(
        {
          [rootDocument]: '# Root document\n\nSee the [missing guide](docs/missing.md).\n',
          'docs/README.md': '# Documentation\n'
        },
        async (cwd) => {
          expect(collectDocumentationViolations({ cwd })).toEqual([
            expect.objectContaining({
              filePath: rootDocument,
              rule: 'broken-local-link'
            })
          ])
        }
      )
    }
  )

  it('reports topic documents at the docs root and documents missing from the index', async () => {
    await withDocumentationFixture(
      {
        'README.md': '# Project\n',
        'AGENTS.md': '# Agent entry\n',
        'docs/README.md': '# Documentation\n',
        'docs/topic.md': '# Misplaced topic\n',
        'docs/contexts/sample/hidden.md': '# Hidden document\n'
      },
      async (cwd) => {
        const violations = collectDocumentationViolations({ cwd })

        expect(violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              filePath: 'docs/topic.md',
              rule: 'docs-root-topic'
            }),
            expect.objectContaining({
              filePath: 'docs/contexts/sample/hidden.md',
              rule: 'unindexed-document'
            })
          ])
        )
      }
    )
  })
})

async function withDocumentationFixture(
  files: Record<string, string>,
  run: (cwd: string) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'cleancode-docs-'))

  try {
    for (const [filePath, contents] of Object.entries(files)) {
      const absolutePath = join(directory, filePath)

      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, contents)
    }

    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
