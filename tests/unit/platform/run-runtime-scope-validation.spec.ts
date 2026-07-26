import type { ValidateRunRuntimeScopeCommand } from '../../../src/contexts/run/application/ports/RunRuntimeScopeValidationPort'
import type { ProjectRegistryRepository } from '../../../src/contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../../../src/contexts/project/application/ports/ProjectRepository'
import {
  createRunRuntimeScopeValidation,
  type RunRuntimeScopeValidationAdapter
} from '../../../src/platform/electron-main/runRuntimeScopeValidationAdapter'

const command: ValidateRunRuntimeScopeCommand = {
  projectId: 'project-1',
  projectDirectory: '/repo/app',
  workspaceId: 'main',
  workspaceDirectory: '/repo/app',
  gitBranch: 'main'
}

describe('Run runtime scope validation adapter', () => {
  it('accepts only the remembered Project workspace with the exact runtime identity', async () => {
    await expect(createAdapter({}).validate(command)).resolves.toBeUndefined()
    await expect(
      createAdapter({ gitBranch: 'feature/theme' }).validate(command)
    ).resolves.toBeUndefined()

    for (const invalidState of [
      { projectRemembered: false },
      { workspaceDirectory: '/repo/other' }
    ]) {
      await expect(createAdapter(invalidState).validate(command)).rejects.toMatchObject({
        code: 'RUN_SCOPE_STALE',
        isExpected: true
      })
    }
  })
})

function createAdapter(input: {
  readonly gitBranch?: string
  readonly projectRemembered?: boolean
  readonly workspaceDirectory?: string
}): RunRuntimeScopeValidationAdapter {
  const projects = {
    findByDirectory: vi.fn(async () => ({
      directory: command.projectDirectory,
      id: command.projectId,
      name: 'app',
      workspaces: [
        {
          workspaceId: command.workspaceId,
          workspaceKind: 'default' as const,
          displayName: 'main',
          directory: input.workspaceDirectory ?? command.workspaceDirectory,
          gitBranch: input.gitBranch ?? command.gitBranch,
          isCurrent: true
        }
      ]
    })),
    save: vi.fn(async () => undefined)
  } satisfies ProjectRepository
  const registry = {
    get: vi.fn(async () => ({
      currentProjectDirectory: input.projectRemembered === false ? null : command.projectDirectory,
      projectDirectories: input.projectRemembered === false ? [] : [command.projectDirectory]
    })),
    save: vi.fn(async () => undefined)
  } satisfies ProjectRegistryRepository

  return createRunRuntimeScopeValidation(registry, projects) as RunRuntimeScopeValidationAdapter
}
