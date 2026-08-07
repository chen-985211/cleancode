import type {
  BlockGraphRepository,
  BlockGraphTransactionResult
} from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { CreateTerminalWorkflowUseCase } from '../../../../src/contexts/block-graph/application/use-cases/CreateTerminalWorkflowUseCase'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import type { TerminalExecutionConfigSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

describe('create terminal workflow use case', () => {
  it('creates, configures, connects, groups, arranges, and validates one workflow atomically', async () => {
    const graph = createGraph()
    const repository = new TransactionalBlockGraphRepository(graph)
    const createWorkflow = new CreateTerminalWorkflowUseCase(repository)

    const result = await createWorkflow.execute({
      canvasRegions: [region(600, 80, 560, 520), region(1800, 80, 520, 500)],
      connections: [
        { sourceRef: 'install', targetRef: 'api' },
        { sourceRef: 'api', targetRef: 'web' }
      ],
      projectDirectory: '/tmp/project',
      terminalGroup: {
        memberRefs: ['install', 'api', 'web', 'worker'],
        name: 'Development'
      },
      terminals: [
        terminal('install', 'Install', 'pnpm install'),
        terminal('api', 'API', 'pnpm dev:api', {
          mode: 'service',
          port: {
            binding: { type: 'environment', variableName: 'PORT' },
            policy: { port: 4100, type: 'preferred' },
            protocol: 'http'
          },
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        }),
        terminal('web', 'Web', 'pnpm dev:web'),
        terminal('worker', 'Worker', 'pnpm dev:worker')
      ],
      workspaceId: 'main'
    })

    expect(repository.transactionCount).toBe(1)
    expect(result.createdTerminals.map(({ ref }) => ref)).toEqual([
      'install',
      'api',
      'web',
      'worker'
    ])
    expect(result.createdConnections).toEqual([
      expect.objectContaining({ sourceRef: 'install', targetRef: 'api' }),
      expect.objectContaining({ sourceRef: 'api', targetRef: 'web' })
    ])
    expect(result.createdTerminalGroupId).toEqual(expect.any(String))
    expect(result.arrangedBlockIds).toHaveLength(4)
    expect(result.arrangedTerminalGroupIds).toEqual([result.createdTerminalGroupId])
    expect(result.plan.nodes.map((node) => node.name)).toEqual(['Install', 'API', 'Web', 'Worker'])
    expect(result.graph.blocks).toHaveLength(5)
    expect(result.graph.connections).toHaveLength(2)
    expect(result.graph.terminalGroups[0]?.memberBlockIds).toHaveLength(4)
    const createdBlocksByName = new Map(
      result.graph.blocks.map((block) => [block.name, block] as const)
    )
    const install = createdBlocksByName.get('Install')!
    const api = createdBlocksByName.get('API')!
    const web = createdBlocksByName.get('Web')!
    const worker = createdBlocksByName.get('Worker')!
    expect(install.position.y).toBe(api.position.y)
    expect(api.position.y).toBe(web.position.y)
    expect(install.position.x).toBeLessThan(api.position.x)
    expect(api.position.x).toBeLessThan(web.position.x)
    expect(worker.position).toEqual({
      x: api.position.x,
      y: install.position.y + install.size.height + 64
    })
    expect(
      result.graph.blocks
        .filter((block) => block.id !== 'unrelated')
        .every((block) => !overlaps(block, region(600, 80, 560, 520)))
    ).toBe(true)
    const createdGroup = result.graph.terminalGroups[0]!
    expect(overlaps(createdGroup, region(600, 80, 560, 520))).toBe(false)
    expect(overlaps(createdGroup, region(1800, 80, 520, 500))).toBe(false)
    expect(
      overlaps(
        createdGroup,
        result.graph.blocks.find((block) => block.id === 'unrelated')!
      )
    ).toBe(false)
  })

  it.each([
    {
      label: 'a duplicate terminal ref',
      override: {
        connections: [],
        terminals: [terminal('api', 'API', 'pnpm api'), terminal('api', 'Web', 'pnpm web')]
      }
    },
    {
      label: 'a connection to an unknown ref',
      override: {
        connections: [{ sourceRef: 'api', targetRef: 'missing' }],
        terminals: [terminal('api', 'API', 'pnpm api')]
      }
    },
    {
      label: 'a workflow with a missing command',
      override: {
        connections: [],
        terminals: [terminal('api', 'API', '')]
      },
      expectedCode: 'TERMINAL_WORKFLOW_COMMAND_MISSING'
    }
  ])('does not commit any graph changes for $label', async ({ override, expectedCode }) => {
    const graph = createGraph()
    const repository = new TransactionalBlockGraphRepository(graph)
    const before = graph.toSnapshot()
    const createWorkflow = new CreateTerminalWorkflowUseCase(repository)

    await expect(
      createWorkflow.execute({
        canvasRegions: [region(600, 80, 560, 520)],
        projectDirectory: '/tmp/project',
        terminalGroup: undefined,
        workspaceId: 'main',
        ...override
      })
    ).rejects.toMatchObject({
      code: expectedCode ?? 'TERMINAL_WORKFLOW_DEFINITION_INVALID'
    })
    expect(repository.graph?.toSnapshot()).toEqual(before)
  })
})

class TransactionalBlockGraphRepository implements BlockGraphRepository {
  transactionCount = 0

  constructor(public graph: BlockGraph | null) {}

  async transactDefaultGraph<TResult>(
    _projectDirectory: string,
    _workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ): Promise<BlockGraphTransactionResult<TResult> | null> {
    this.transactionCount += 1
    if (!this.graph) return null

    const candidate = BlockGraph.fromSnapshot(this.graph.toSnapshot())
    const result = await transaction(candidate)
    this.graph = candidate
    return { graph: candidate.toSnapshot(), result }
  }

  async initializeDefaultGraph(_projectDirectory: string, graph: BlockGraph) {
    return graph.toSnapshot()
  }

  async findDefaultGraph() {
    return this.graph
  }

  async findDefaultGraphSnapshot() {
    return this.graph?.toSnapshot() ?? null
  }
}

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main'
  })
  graph.createTerminalBlock({
    id: 'unrelated',
    description: '',
    name: 'Unrelated',
    position: { x: 80, y: 80 },
    size: { width: 420, height: 280 }
  })
  return graph
}

function terminal(
  ref: string,
  name: string,
  launchCommand: string,
  executionConfig: TerminalExecutionConfigSnapshot = {
    mode: 'task',
    successExitCodes: [0],
    timeoutMs: null
  }
) {
  return {
    description: '',
    executionConfig,
    launchCommand,
    name,
    ref,
    size: { width: 420, height: 280 }
  }
}

function region(x: number, y: number, width: number, height: number) {
  return { position: { x, y }, size: { width, height } }
}

function overlaps(
  left: {
    readonly position: { readonly x: number; readonly y: number }
    readonly size: { readonly width: number; readonly height: number }
  },
  right: ReturnType<typeof region>
): boolean {
  return !(
    left.position.x + left.size.width <= right.position.x ||
    right.position.x + right.size.width <= left.position.x ||
    left.position.y + left.size.height <= right.position.y ||
    right.position.y + right.size.height <= left.position.y
  )
}
