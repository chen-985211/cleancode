import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BlockGraphAgentToolAdapter } from '../../../../src/contexts/agent/infrastructure/block-graph/BlockGraphAgentToolAdapter'
import { ArrangeTerminalLayoutUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ArrangeTerminalLayoutUseCase'
import { BuildTerminalWorkflowPlanUseCase } from '../../../../src/contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase'
import { ConnectTerminalBlocksUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ConnectTerminalBlocksUseCase'
import { CreateTerminalBlockUseCase } from '../../../../src/contexts/block-graph/application/use-cases/CreateTerminalBlockUseCase'
import { CreateTerminalWorkflowUseCase } from '../../../../src/contexts/block-graph/application/use-cases/CreateTerminalWorkflowUseCase'
import { DisconnectTerminalBlocksUseCase } from '../../../../src/contexts/block-graph/application/use-cases/DisconnectTerminalBlocksUseCase'
import { GetDefaultGraphUseCase } from '../../../../src/contexts/block-graph/application/use-cases/GetDefaultGraphUseCase'
import { UpdateTerminalBlockMetadataUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateTerminalBlockMetadataUseCase'
import { UpdateTerminalExecutionConfigUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateTerminalExecutionConfigUseCase'
import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { FileSystemBlockGraphRepository } from '../../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'
import { getAppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'

const context = { projectDirectory: '/repo/project', workspaceId: 'main' }

describe('agent block graph workflow tool adapter', () => {
  let adapter: BlockGraphAgentToolAdapter
  let appStateDirectory: string
  let repository: FileSystemBlockGraphRepository
  let terminalIds: Record<'build' | 'install' | 'test', string>

  beforeEach(async () => {
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-block-graph-'))
    repository = new FileSystemBlockGraphRepository(appStateDirectory)
    terminalIds = await createConfiguredTerminals(repository)
    adapter = createAdapter(repository)
  })

  afterEach(async () => {
    await rm(appStateDirectory, { force: true, recursive: true })
  })

  it('persists execution configuration and returns the exact created connection id', async () => {
    const configured = await adapter.updateTerminalExecutionConfig(context, {
      blockId: terminalIds.build,
      executionConfig: {
        mode: 'service',
        port: {
          binding: { type: 'environment', variableName: 'PORT' },
          policy: { port: 4173, type: 'preferred' },
          protocol: 'http'
        },
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000
      }
    })

    expect(findBlock(configured, terminalIds.build).executionConfig).toEqual({
      mode: 'service',
      port: {
        binding: { type: 'environment', variableName: 'PORT' },
        policy: { port: 4173, type: 'preferred' },
        protocol: 'http'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })
    const automaticallyConfigured = await adapter.updateTerminalExecutionConfig(context, {
      blockId: terminalIds.install,
      executionConfig: {
        mode: 'service',
        port: {
          binding: { template: '--port {port}', type: 'argument' },
          policy: { type: 'auto' },
          protocol: 'http'
        },
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000
      }
    })

    expect(findBlock(automaticallyConfigured, terminalIds.install).executionConfig).toEqual({
      mode: 'service',
      port: {
        binding: { template: '--port {port}', type: 'argument' },
        policy: { type: 'auto' },
        protocol: 'http'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })

    const unrelatedConnection = await adapter.connectTerminalBlocks(context, {
      sourceBlockId: terminalIds.build,
      targetBlockId: terminalIds.test
    })
    const connected = await adapter.connectTerminalBlocks(context, {
      sourceBlockId: terminalIds.install,
      targetBlockId: terminalIds.build
    })
    const exactConnection = connected.graph.connections?.find(
      (connection) =>
        connection.sourceBlockId === terminalIds.install &&
        connection.targetBlockId === terminalIds.build
    )

    expect(connected.connectionId).toBe(exactConnection?.id)
    expect(connected.connectionId).toEqual(expect.any(String))
    expect(connected.connectionId).not.toBe(unrelatedConnection.connectionId)

    const disconnected = await adapter.disconnectTerminalBlocks(context, {
      connectionId: connected.connectionId
    })
    const persisted = await repository.findDefaultGraphSnapshot(
      context.projectDirectory,
      context.workspaceId
    )

    if (!persisted) throw new Error('Expected the configured graph to be persisted.')
    expect(findBlock(persisted, terminalIds.install).executionConfig).toEqual({
      mode: 'service',
      port: {
        binding: { template: '--port {port}', type: 'argument' },
        policy: { type: 'auto' },
        protocol: 'http'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })
    expect(disconnected.connections).toEqual([
      expect.objectContaining({ id: unrelatedConnection.connectionId })
    ])
    const { quickExecutionSlots, ...persistedAgentProjection } = persisted
    expect(persistedAgentProjection).toEqual(disconnected)
    expect(quickExecutionSlots).toEqual([
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ])
  })

  it('returns stable full and from-block plans from the BlockGraph use case', async () => {
    await adapter.connectTerminalBlocks(context, {
      sourceBlockId: terminalIds.install,
      targetBlockId: terminalIds.build
    })
    await adapter.connectTerminalBlocks(context, {
      sourceBlockId: terminalIds.build,
      targetBlockId: terminalIds.test
    })

    const fullPlan = await adapter.inspectTerminalWorkflowPlan(context, {
      scope: { type: 'full' }
    })
    const fromBuildPlan = await adapter.inspectTerminalWorkflowPlan(context, {
      scope: { blockId: terminalIds.build, type: 'from-block' }
    })

    expect(fullPlan.nodes.map((node) => [node.blockId, node.dependencyBlockIds])).toEqual([
      [terminalIds.install, []],
      [terminalIds.build, [terminalIds.install]],
      [terminalIds.test, [terminalIds.build]]
    ])
    expect(fromBuildPlan.nodes.map((node) => [node.blockId, node.dependencyBlockIds])).toEqual([
      [terminalIds.build, []],
      [terminalIds.test, [terminalIds.build]]
    ])
  })

  it('passes through stable BlockGraph domain errors', async () => {
    await adapter.connectTerminalBlocks(context, {
      sourceBlockId: terminalIds.install,
      targetBlockId: terminalIds.build
    })

    await expect(
      adapter.connectTerminalBlocks(context, {
        sourceBlockId: terminalIds.install,
        targetBlockId: terminalIds.build
      })
    ).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'TERMINAL_CONNECTION_DUPLICATE'
    )
    await expect(
      adapter.disconnectTerminalBlocks(context, { connectionId: 'missing-connection' })
    ).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'TERMINAL_CONNECTION_NOT_FOUND'
    )
  })

  it('creates and arranges terminals through one atomic BlockGraph callback each', async () => {
    const activeAgentRegion = {
      position: { x: 1_600, y: 160 },
      size: { height: 460, width: 720 }
    }
    const otherAgentRegions = [
      {
        position: { x: 2_900, y: 80 },
        size: { height: 520, width: 760 }
      }
    ]
    const beforeCreate = await adapter.inspectGraph(context)
    const createdGraph = await adapter.createTerminalBlock(context, {
      canvasRegions: [activeAgentRegion, ...otherAgentRegions],
      description: 'Runs the API server',
      launchCommand: 'pnpm dev:api',
      name: 'API Server',
      size: { height: 300, width: 460 },
      type: 'terminal'
    })
    const previousIds = new Set(beforeCreate.blocks.map((block) => block.id))
    const createdBlock = createdGraph.blocks.find((block) => !previousIds.has(block.id))

    expect(createdBlock).toMatchObject({
      description: 'Runs the API server',
      launchCommand: 'pnpm dev:api',
      name: 'API Server',
      size: { height: 300, width: 460 }
    })
    expect(createdBlock && overlaps(createdBlock, activeAgentRegion)).toBe(false)
    expect(createdBlock && overlaps(createdBlock, otherAgentRegions[0])).toBe(false)

    if (!createdBlock) throw new Error('Expected the adapter to create a terminal block.')

    const arranged = await adapter.arrangeTerminalLayout(context, {
      blockIds: [createdBlock.id],
      canvasRegions: [
        {
          position: { x: 4_200, y: 240 },
          size: { height: 460, width: 720 }
        },
        ...otherAgentRegions
      ]
    })

    expect(arranged).toMatchObject({
      arrangedBlockIds: [createdBlock.id],
      arrangedTerminalGroupIds: [],
      graphChanged: true
    })
  })

  it('creates a configured terminal workflow atomically through the Agent adapter', async () => {
    const before = await adapter.inspectGraph(context)
    const created = await adapter.createTerminalWorkflow(context, {
      canvasRegions: [{ position: { x: 1_600, y: 120 }, size: { height: 420, width: 720 } }],
      connections: [{ sourceRef: 'api', targetRef: 'web' }],
      terminalGroup: { memberRefs: ['api', 'web', 'worker'], name: 'Development' },
      terminals: [
        {
          description: 'API service',
          launchCommand: 'pnpm dev:api',
          name: 'API',
          ref: 'api'
        },
        {
          description: 'Web client',
          launchCommand: 'pnpm dev:web',
          name: 'Web',
          ref: 'web'
        },
        {
          description: 'Background worker',
          launchCommand: 'pnpm dev:worker',
          name: 'Worker',
          ref: 'worker'
        }
      ]
    })
    const persisted = await repository.findDefaultGraphSnapshot(
      context.projectDirectory,
      context.workspaceId
    )

    expect(created.createdTerminals).toHaveLength(3)
    expect(created.createdConnections).toEqual([
      expect.objectContaining({ sourceRef: 'api', targetRef: 'web' })
    ])
    expect(created.createdTerminalGroupId).toEqual(expect.any(String))
    expect(created.plan.nodes).toHaveLength(3)
    expect(persisted?.blocks).toHaveLength(before.blocks.length + 3)
    expect(persisted?.connections).toHaveLength((before.connections?.length ?? 0) + 1)

    await expect(
      adapter.createTerminalWorkflow(context, {
        canvasRegions: [{ position: { x: 0, y: 0 }, size: { height: 10, width: 10 } }],
        connections: [{ sourceRef: 'missing', targetRef: 'only' }],
        terminals: [
          {
            description: '',
            launchCommand: 'pnpm dev',
            name: 'Only',
            ref: 'only'
          }
        ]
      })
    ).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'TERMINAL_WORKFLOW_DEFINITION_INVALID'
    )
    const afterFailure = await repository.findDefaultGraphSnapshot(
      context.projectDirectory,
      context.workspaceId
    )

    expect(afterFailure).toEqual(persisted)
  })
})

function createAdapter(repository: FileSystemBlockGraphRepository): BlockGraphAgentToolAdapter {
  const arrange = new ArrangeTerminalLayoutUseCase(repository)
  const connect = new ConnectTerminalBlocksUseCase(repository)
  const createTerminal = new CreateTerminalBlockUseCase(repository)
  const createTerminalWorkflow = new CreateTerminalWorkflowUseCase(repository)
  const disconnect = new DisconnectTerminalBlocksUseCase(repository)
  const getGraph = new GetDefaultGraphUseCase(repository)
  const inspectPlan = new BuildTerminalWorkflowPlanUseCase(repository)
  const updateExecutionConfig = new UpdateTerminalExecutionConfigUseCase(repository)

  return new BlockGraphAgentToolAdapter({
    arrangeTerminalLayout: (command) => arrange.execute(command),
    buildTerminalWorkflowPlan: (query) => inspectPlan.execute(query),
    connectTerminalBlocks: (command) => connect.execute(command),
    createTerminalBlock: (command) => createTerminal.execute(command),
    createTerminalWorkflow: (command) => createTerminalWorkflow.execute(command),
    createTerminalGroup: notUsed,
    deleteBlock: notUsed,
    disconnectTerminalBlocks: (command) => disconnect.execute(command),
    dissolveTerminalGroup: notUsed,
    getDefaultGraph: (query) => getGraph.execute({ ...query, projectId: 'project-1' }),
    moveBlock: notUsed,
    moveTerminalGroup: notUsed,
    resizeTerminalBlock: notUsed,
    setTerminalGroupCollapsed: notUsed,
    updateTerminalBlockMetadata: notUsed,
    updateTerminalExecutionConfig: (command) => updateExecutionConfig.execute(command),
    updateTerminalGroupMetadata: notUsed
  })
}

function overlaps(
  first: {
    readonly position: { readonly x: number; readonly y: number }
    readonly size: { readonly height: number; readonly width: number }
  },
  second: {
    readonly position: { readonly x: number; readonly y: number }
    readonly size: { readonly height: number; readonly width: number }
  }
): boolean {
  return !(
    first.position.x + first.size.width <= second.position.x ||
    second.position.x + second.size.width <= first.position.x ||
    first.position.y + first.size.height <= second.position.y ||
    second.position.y + second.size.height <= first.position.y
  )
}

async function createConfiguredTerminals(
  repository: FileSystemBlockGraphRepository
): Promise<Record<'build' | 'install' | 'test', string>> {
  const getGraph = new GetDefaultGraphUseCase(repository)
  const createTerminal = new CreateTerminalBlockUseCase(repository)
  const updateMetadata = new UpdateTerminalBlockMetadataUseCase(repository)

  await getGraph.execute({ ...context, projectId: 'project-1' })
  const terminalIds = {} as Record<'build' | 'install' | 'test', string>

  for (const [index, name] of ['install', 'build', 'test'].entries()) {
    const graph = await createTerminal.execute({
      ...context,
      description: `${name} terminal`,
      name,
      position: { x: index * 480, y: 120 }
    })
    const block = graph.blocks.find((candidate) => candidate.name === name)

    if (!block) throw new Error(`Expected ${name} terminal.`)

    terminalIds[name as keyof typeof terminalIds] = block.id
    await updateMetadata.execute({
      ...context,
      blockId: block.id,
      description: block.description,
      launchCommand: `pnpm ${name}`,
      name: block.name
    })
  }

  return terminalIds
}

function findBlock(
  graph: BlockGraphSnapshot,
  blockId: string
): BlockGraphSnapshot['blocks'][number] {
  const block = graph.blocks.find((candidate) => candidate.id === blockId)

  if (!block) throw new Error(`Expected terminal block ${blockId}.`)

  return block
}

async function notUsed(): Promise<never> {
  throw new Error('Unexpected unrelated Agent block graph tool call.')
}
