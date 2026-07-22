import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  collectAgentProviderBoundaryViolations,
  discoverBuiltInAgentProviders
} from '../../../scripts/check-agent-provider-boundary.mjs'

describe('Agent Provider boundary quality gate', () => {
  it('discovers an unknown built-in Provider and rejects its id in production Presentation', async () => {
    const directory = await createFixtureRepository()

    try {
      await writePresentationFile(
        directory,
        'Bad.tsx',
        "export const selectedProviderId = 'fixture-provider'\n"
      )
      await writePresentationFile(
        directory,
        'bad.css',
        ".provider[data-provider-id='fixture-provider'] { display: block; }\n"
      )

      expect(discoverBuiltInAgentProviders({ cwd: directory })).toEqual([
        {
          directoryPath: 'src/contexts/agent/infrastructure/providers/fixture',
          filePath:
            'src/contexts/agent/infrastructure/providers/fixture/FixtureAgentProviderContribution.ts',
          providerId: 'fixture-provider'
        }
      ])
      const violations = collectAgentProviderBoundaryViolations({ cwd: directory })
      expect(violations).toHaveLength(2)
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'src/presentation/app-shell/Bad.tsx',
            line: 1,
            providerId: 'fixture-provider',
            rule: 'no-provider-id-literal'
          }),
          expect.objectContaining({
            filePath: 'src/presentation/app-shell/bad.css',
            line: 1,
            providerId: 'fixture-provider',
            rule: 'no-provider-id-literal'
          })
        ])
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects imports from a concrete Provider infrastructure directory', async () => {
    const directory = await createFixtureRepository()

    try {
      await writePresentationFile(
        directory,
        'Bad.tsx',
        [
          "import { FixtureAgentProviderContribution } from '../../contexts/agent/infrastructure/providers/fixture/FixtureAgentProviderContribution'",
          'export const contribution = new FixtureAgentProviderContribution()',
          ''
        ].join('\n')
      )

      expect(collectAgentProviderBoundaryViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/presentation/app-shell/Bad.tsx',
          line: 1,
          providerId: 'fixture-provider',
          rule: 'no-provider-infrastructure-reference'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows capability-driven Presentation and the recorded legacy fallback only', async () => {
    const directory = await createFixtureRepository('codex')

    try {
      await writePresentationFile(
        directory,
        'AgentProviderIdentity.tsx',
        [
          'export function AgentProviderIdentity({ descriptor }) {',
          '  return <span data-provider-id={descriptor.id}>{descriptor.displayName}</span>',
          '}',
          ''
        ].join('\n')
      )
      await writePresentationFile(
        directory,
        'agentConsoleModel.ts',
        [
          "const rendererLegacyDefaultProviderId = 'codex'",
          'export const fallbackProviderId = rendererLegacyDefaultProviderId',
          ''
        ].join('\n')
      )

      expect(collectAgentProviderBoundaryViolations({ cwd: directory })).toEqual([])

      await writePresentationFile(
        directory,
        'agentConsoleModel.ts',
        "const unrecordedFallback = 'codex'\n"
      )
      expect(collectAgentProviderBoundaryViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/presentation/app-shell/agentConsoleModel.ts',
          rule: 'no-provider-id-literal'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('fails closed when a contribution does not expose a static descriptor id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-agent-provider-boundary-'))

    try {
      const contributionDirectory = join(
        directory,
        'src',
        'contexts',
        'agent',
        'infrastructure',
        'providers',
        'fixture'
      )
      await mkdir(contributionDirectory, { recursive: true })
      await writeFile(
        join(contributionDirectory, 'FixtureAgentProviderContribution.ts'),
        'export class FixtureAgentProviderContribution {}\n'
      )

      expect(collectAgentProviderBoundaryViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath:
            'src/contexts/agent/infrastructure/providers/fixture/FixtureAgentProviderContribution.ts',
          rule: 'provider-id-discovery-failed'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

async function createFixtureRepository(providerId = 'fixture-provider'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cleancode-agent-provider-boundary-'))
  const contributionDirectory = join(
    directory,
    'src',
    'contexts',
    'agent',
    'infrastructure',
    'providers',
    'fixture'
  )
  await mkdir(contributionDirectory, { recursive: true })
  await writeFile(
    join(contributionDirectory, 'FixtureAgentProviderContribution.ts'),
    [
      'export class FixtureAgentProviderContribution {',
      '  readonly descriptor = {',
      `    id: '${providerId}',`,
      "    displayName: 'Fixture Provider'",
      '  } as const',
      '}',
      ''
    ].join('\n')
  )
  return directory
}

async function writePresentationFile(
  directory: string,
  fileName: string,
  content: string
): Promise<void> {
  const presentationDirectory = join(directory, 'src', 'presentation', 'app-shell')
  await mkdir(presentationDirectory, { recursive: true })
  await writeFile(join(presentationDirectory, fileName), content)
}
