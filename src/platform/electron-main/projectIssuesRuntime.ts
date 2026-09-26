import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import type { ProjectRegistryRepository } from '../../contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectWorkspaceTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import type { PrepareWorkspaceInitializationUseCase } from '../../contexts/project/application/use-cases/PrepareWorkspaceInitializationUseCase'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import { ProjectIssueScope } from '../../contexts/project/application/services/ProjectIssueScope'
import { ProjectIssueReadCache } from '../../contexts/project/application/services/ProjectIssueReadCache'
import { ListProjectIssuesUseCase } from '../../contexts/project/application/use-cases/ListProjectIssuesUseCase'
import { GetProjectIssueUseCase } from '../../contexts/project/application/use-cases/GetProjectIssueUseCase'
import { ConfigureProjectIssueRepositoryUseCase } from '../../contexts/project/application/use-cases/ConfigureProjectIssueRepositoryUseCase'
import { StartIssueWorkspaceUseCase } from '../../contexts/project/application/use-cases/StartIssueWorkspaceUseCase'
import { GitHubCliIssueAdapter } from '../../contexts/project/infrastructure/github/GitHubCliIssueAdapter'
import { GitCliIssueBaseAdapter } from '../../contexts/project/infrastructure/filesystem/GitCliIssueBaseAdapter'
import { registerProjectIssueIpcHandlers } from './projectIssueIpcHandlers'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export function registerProjectIssuesRuntime(input: {
  readonly projects: ProjectRepository
  readonly registry: ProjectRegistryRepository
  readonly transactions: ProjectWorkspaceTransactionCoordinator
  readonly preparation: PrepareWorkspaceInitializationUseCase
  readonly loadWorkbench: (project: ProjectSnapshot) => Promise<unknown>
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
}) {
  const scope = new ProjectIssueScope(input.projects, input.registry)
  const github = new GitHubCliIssueAdapter()
  const cache = new ProjectIssueReadCache()
  const list = new ListProjectIssuesUseCase(scope, github, cache)
  const detail = new GetProjectIssueUseCase(scope, github, cache)
  const configure = new ConfigureProjectIssueRepositoryUseCase(
    scope,
    github,
    input.projects,
    input.transactions
  )
  const start = new StartIssueWorkspaceUseCase({
    scope,
    github,
    cache,
    base: new GitCliIssueBaseAdapter(),
    preparation: input.preparation
  })
  registerProjectIssueIpcHandlers({
    ipcMain: input.ipcMain,
    logger: input.logger,
    list: (query) => list.execute(query),
    detail: (query) => detail.execute(query),
    configure: (command) => configure.execute(command),
    prepare: (query) => start.prepare(query),
    start: async (command, progress) => input.loadWorkbench(await start.execute(command, progress))
  })
}
