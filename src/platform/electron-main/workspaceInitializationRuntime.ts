import { join } from 'node:path'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import type {
  WorkspaceInitializationDetails,
  WorkspaceInitializationSnapshot
} from '../../contexts/project/application/dto/WorkspaceInitializationDetails'
import type { WorkspaceInitializationContentPort } from '../../contexts/project/application/ports/WorkspaceInitializationContentPort'
import {
  PrepareWorkspaceInitializationUseCase,
  type WorkspaceInitializationPreparationDependencies
} from '../../contexts/project/application/use-cases/PrepareWorkspaceInitializationUseCase'
import { InitializeWorkspaceContentUseCase } from '../../contexts/project/application/use-cases/InitializeWorkspaceContentUseCase'
import { ValidateProjectWorkspaceScopeUseCase } from '../../contexts/project/application/use-cases/ValidateProjectWorkspaceScopeUseCase'
import { FileSystemWorkspaceInitializationRepository } from '../../contexts/project/infrastructure/filesystem/FileSystemWorkspaceInitializationRepository'
import type { GetDefaultGraphUseCase } from '../../contexts/block-graph/application/use-cases/GetDefaultGraphUseCase'
import type { InstantiateBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase'
import { ListBlockTemplatesUseCase } from '../../contexts/block-graph/application/use-cases/ListBlockTemplatesUseCase'
import { PrepareBlockTemplateUseCase } from '../../contexts/block-graph/application/use-cases/PrepareBlockTemplateUseCase'
import type { BlockTemplateRepository } from '../../contexts/block-graph/application/ports/BlockTemplateRepository'
import { FileSystemBlockTemplateRepository } from '../../contexts/block-graph/infrastructure/filesystem/FileSystemBlockTemplateRepository'
import type { ListWorkspaceAgentsUseCase } from '../../contexts/agent/application/use-cases/ListWorkspaceAgentsUseCase'
import type { CreateWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import type { TerminalWorkflowService } from '../../contexts/run/application/use-cases/TerminalWorkflowService'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import { registerWorkspaceInitializationIpcHandlers } from './workspaceInitializationIpcHandlers'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import type { ProjectIpcHandlersInput } from './projectIpcHandlers'

interface WorkspaceInitializationRuntimeInput extends Omit<
  WorkspaceInitializationPreparationDependencies,
  'repository' | 'content'
> {
  readonly appStateDirectory: string
  readonly templates: BlockTemplateRepository
  readonly graphs: GetDefaultGraphUseCase
  readonly instantiate: InstantiateBlockTemplateUseCase
  readonly agents: ListWorkspaceAgentsUseCase
  readonly createAgent: CreateWorkspaceAgentUseCase
  readonly workflow: TerminalWorkflowService
}

export function createWorkspaceInitializationRuntime(input: WorkspaceInitializationRuntimeInput) {
  const repository = new FileSystemWorkspaceInitializationRepository(
    join(input.appStateDirectory, 'workspace-initialization.json')
  )
  const prepared = new PrepareBlockTemplateUseCase(
    input.templates,
    new FileSystemBlockTemplateRepository(
      join(input.appStateDirectory, 'workspace-prepared-templates.json')
    )
  )
  const validation = new ValidateProjectWorkspaceScopeUseCase(input.projects, input.registry)
  const templateCatalog = new ListBlockTemplatesUseCase(input.templates)
  const content: WorkspaceInitializationContentPort = {
    listTemplateIds: async (projectId) => {
      const [project, global] = await Promise.all([
        templateCatalog.execute({ scope: { type: 'project', projectId } }),
        templateCatalog.execute({ scope: { type: 'global' } })
      ])
      return [...project, ...global].map((item) => item.id)
    },
    hasPreparedTemplate: async (itemId) => (await prepared.find(itemId)) !== null,
    isEmpty: async (scope) => {
      if (!(await validation.execute(scope))) stale()
      const [graph, agents] = await Promise.all([
        input.graphs.execute(scope),
        input.agents.execute(scope)
      ])
      return graph.blocks.length === 0 && graph.terminalGroups.length === 0 && agents.length === 0
    },
    prepareTemplate: async (scope, item) =>
      (
        await prepared.execute({
          projectId: scope.projectId,
          operationId: item.id,
          templateId: item.templateId!
        })
      ).name,
    createTemplate: (scope, item) =>
      input.transactions.run(scope.projectDirectory, async () => {
        if (!(await validation.execute(scope))) stale()
        await input.graphs.execute(scope)
        const template = await prepared.find(item.id)
        if (!template)
          throw createExpectedAppError(
            'BLOCK_TEMPLATE_NOT_FOUND',
            'Prepared workspace template was not found.'
          )
        const result = await input.instantiate.execute(
          {
            projectDirectory: scope.projectDirectory,
            workspaceId: scope.workspaceId,
            templateId: template.id,
            origin: item.position!,
            operationId: item.id
          },
          template
        )
        return {
          objectIds: [
            ...result.instance.blockIds,
            ...(result.instance.terminalGroupId ? [result.instance.terminalGroupId] : [])
          ],
          executionTarget: result.instance.executionScope
        }
      }),
    createAgent: async (scope, item) => {
      if (!(await validation.execute(scope))) stale()
      const agent = await input.createAgent.execute(
        {
          projectDirectory: scope.projectDirectory,
          projectId: scope.projectId,
          workspaceDirectory: scope.workspaceDirectory,
          workspaceId: scope.workspaceId,
          providerId: item.providerId!,
          agentId: item.id,
          initialPosition: item.position!
        },
        item.id
      )
      return { objectIds: [agent.agentId], executionTarget: null }
    },
    run: async (scope, result) => {
      if (!(await validation.execute(scope))) stale()
      if (!result.executionTarget)
        throw createExpectedAppError(
          'WORKSPACE_INITIALIZATION_INVALID',
          'Initialization has no execution target.'
        )
      return (
        await input.workflow.start({
          projectDirectory: scope.projectDirectory,
          projectId: scope.projectId,
          workspaceId: scope.workspaceId,
          workspaceDirectory: scope.workspaceDirectory,
          workingDirectory: scope.workspaceDirectory,
          gitBranch: scope.branchName,
          scope: result.executionTarget
        })
      ).id
    }
  }
  const preparation = new PrepareWorkspaceInitializationUseCase({ ...input, repository, content })
  const initialize = new InitializeWorkspaceContentUseCase(
    repository,
    content,
    (scope) => validation.execute(scope),
    (directory) => preparation.getDefaults(directory).then(() => undefined)
  )
  const details = async (
    snapshot: WorkspaceInitializationSnapshot
  ): Promise<WorkspaceInitializationDetails> => {
    const templates = []
    for (const item of snapshot.items) {
      if (item.kind !== 'template') continue
      const template = await prepared.find(item.id)
      if (template) templates.push({ itemId: item.id, template })
    }
    return { initialization: (await initialize.inspect(snapshot.id)) ?? snapshot, templates }
  }
  return {
    wrapLifecycle: (
      lifecycle: Pick<ProjectIpcHandlersInput, 'archiveBranchWorkspace' | 'forgetProject'>
    ) => ({
      createBranchWorkspace: preparation.create.bind(preparation),
      archiveBranchWorkspace: async (
        command: Parameters<typeof lifecycle.archiveBranchWorkspace>[0]
      ) => {
        const project = await lifecycle.archiveBranchWorkspace(command)
        await preparation.cancel(command.projectDirectory, command.workspaceId)
        return project
      },
      forgetProject: async (directory: string) => {
        const result = await lifecycle.forgetProject(directory)
        await preparation.cancel(directory)
        return result
      }
    }),
    load: async (project: ProjectSnapshot) => {
      const workspace = project.workspaces.find((item) => item.isCurrent)
      if (!workspace) return null
      const snapshot = (await repository.list(project.id, workspace.workspaceId)).at(-1)
      return snapshot ? initialize.inspect(snapshot.id) : null
    },
    register: (ipcMain: IpcMainLike, logger: Logger) =>
      registerWorkspaceInitializationIpcHandlers({
        ipcMain,
        logger,
        getDefaults: preparation.getDefaults.bind(preparation),
        cancel: preparation.cancelOne.bind(preparation),
        saveDefaults: preparation.saveDefaults.bind(preparation),
        list: async (query) =>
          Promise.all(
            (await preparation.list(query.projectDirectory, query.workspaceId)).map(details)
          ),
        begin: async (command) => details(await preparation.beginEmpty(command)),
        apply: async (command) => {
          const initialization = await initialize.execute(command)
          const [graph, agents] = await Promise.all([
            input.graphs.execute(initialization),
            input.agents.execute(initialization)
          ])
          return { initialization, graph, agents }
        }
      })
  }
}

function stale(): never {
  throw createExpectedAppError(
    'WORKSPACE_INITIALIZATION_SCOPE_STALE',
    'Workspace initialization scope is stale.'
  )
}
