import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  BlockGraph,
  defaultCanvasViewport,
  defaultTerminalBlockSize,
  defaultTerminalExecutionConfig
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { FileSystemBlockGraphRepository } from '../../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'
import { getAppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'

describe('block graph filesystem repository', () => {
  let projectDirectory: string
  let appStateDirectory: string

  beforeEach(async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-graph-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-app-state-'))
  })

  afterEach(async () => {
    await rm(projectDirectory, { recursive: true, force: true })
    await rm(appStateDirectory, { recursive: true, force: true })
  })

  it('keeps the main workspace default graph outside the opened project directory', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceId: 'main'
    })
    const terminalBlock = graph.createTerminalBlock({
      name: 'Terminal',
      description: 'Local shell',
      position: { x: 240, y: 180 }
    })
    const secondTerminalBlock = graph.createTerminalBlock({
      name: 'Terminal 2',
      description: 'Local shell',
      position: { x: 760, y: 180 }
    })
    graph.updateTerminalBlockMetadata(terminalBlock.id, {
      name: 'Terminal',
      description: 'Local shell',
      launchCommand: ' pnpm dev '
    })

    graph.createTerminalGroup({
      id: 'development-group',
      name: '启动项目',
      memberBlockIds: [terminalBlock.id, secondTerminalBlock.id]
    })

    await repository.initializeDefaultGraph(projectDirectory, graph)

    const reopenedRepository = new FileSystemBlockGraphRepository(appStateDirectory)
    const openedGraph = await reopenedRepository.findDefaultGraph(projectDirectory, 'main')
    const openedSnapshot = await reopenedRepository.findDefaultGraphSnapshot(
      projectDirectory,
      'main'
    )
    const graphMetadata = JSON.parse(
      await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
    ) as { graph: { id: string }; version: number }

    expect(await pathExists(join(projectDirectory, '.cleancode'))).toBe(false)
    expect(graphMetadata).toMatchObject({ graph: { id: graph.id }, version: 2 })
    expect(openedGraph?.toSnapshot()).toEqual({
      id: graph.id,
      projectId: 'project-1',
      workspaceId: 'main',
      viewport: defaultCanvasViewport,
      blocks: [
        {
          id: terminalBlock.id,
          type: 'terminal',
          name: 'Terminal',
          description: 'Local shell',
          launchCommand: 'pnpm dev',
          executionConfig: defaultTerminalExecutionConfig,
          position: { x: 240, y: 180 },
          size: defaultTerminalBlockSize
        },
        {
          id: secondTerminalBlock.id,
          type: 'terminal',
          name: 'Terminal 2',
          description: 'Local shell',
          launchCommand: '',
          executionConfig: defaultTerminalExecutionConfig,
          position: { x: 760, y: 180 },
          size: defaultTerminalBlockSize
        }
      ],
      terminalGroups: [
        {
          id: 'development-group',
          type: 'terminal-group',
          name: '启动项目',
          position: { x: 208, y: 104 },
          size: { width: 1304, height: 612 },
          isCollapsed: false,
          memberBlockIds: [terminalBlock.id, secondTerminalBlock.id]
        }
      ],
      connections: []
    })
    expect(openedSnapshot).toEqual(openedGraph?.toSnapshot())
  })

  it('ignores a legacy default graph inside the opened project directory', async () => {
    const legacyGraph = {
      id: 'legacy-graph',
      projectId: 'legacy-project',
      workspaceId: 'main',
      blocks: [
        {
          id: 'legacy-terminal',
          type: 'terminal',
          name: 'Legacy Terminal',
          description: '本地终端',
          position: { x: 300, y: 220 }
        }
      ]
    }
    await mkdir(join(projectDirectory, '.cleancode', 'workspaces', 'main'), {
      recursive: true
    })
    const legacyGraphPath = join(
      projectDirectory,
      '.cleancode',
      'workspaces',
      'main',
      'default-graph.json'
    )
    const legacyGraphContents = `${JSON.stringify(legacyGraph, null, 2)}\n`
    await writeFile(legacyGraphPath, legacyGraphContents)

    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const openedGraph = await repository.findDefaultGraph(projectDirectory, 'main')
    const openedSnapshot = await repository.findDefaultGraphSnapshot(projectDirectory, 'main')

    expect(openedGraph).toBeNull()
    expect(openedSnapshot).toBeNull()
    await expect(readFile(legacyGraphPath, 'utf8')).resolves.toBe(legacyGraphContents)
    await expect(findFilesNamed(appStateDirectory, 'default-graph.json')).resolves.toEqual([])
  })

  it('initializes fresh app state without loading a legacy project-local graph', async () => {
    const legacyGraph = {
      id: 'legacy-before-initialization',
      projectId: 'legacy-project',
      workspaceId: 'main',
      blocks: []
    }
    const legacyDirectory = join(projectDirectory, '.cleancode', 'workspaces', 'main')
    await mkdir(legacyDirectory, { recursive: true })
    await writeFile(
      join(legacyDirectory, 'default-graph.json'),
      `${JSON.stringify(legacyGraph, null, 2)}\n`
    )
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)

    const freshGraph = BlockGraph.createDefault({ projectId: 'new-project', workspaceId: 'main' })
    const initialized = await repository.initializeDefaultGraph(projectDirectory, freshGraph)

    expect(initialized.id).toBe(freshGraph.id)
    expect((await repository.findDefaultGraphSnapshot(projectDirectory, 'main'))?.id).toBe(
      freshGraph.id
    )
  })

  it('serializes the complete read-modify-write transaction for one workspace', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceId: 'main'
    })
    await repository.initializeDefaultGraph(projectDirectory, graph)

    const [firstTransaction, secondTransaction] = await Promise.all([
      repository.transactDefaultGraph(projectDirectory, 'main', (currentGraph) =>
        currentGraph.createTerminalBlock({
          id: 'terminal-install',
          name: 'Install',
          description: 'Install dependencies',
          position: { x: 120, y: 160 }
        })
      ),
      repository.transactDefaultGraph(projectDirectory, 'main', (currentGraph) =>
        currentGraph.createTerminalBlock({
          id: 'terminal-dev',
          name: 'Dev',
          description: 'Start development server',
          position: { x: 760, y: 160 }
        })
      )
    ])

    const persisted = await repository.findDefaultGraphSnapshot(projectDirectory, 'main')

    expect(firstTransaction?.result.id).toBe('terminal-install')
    expect(secondTransaction?.graph.blocks.map((block) => block.id)).toEqual([
      'terminal-install',
      'terminal-dev'
    ])
    expect(persisted?.blocks.map((block) => block.id)).toEqual(['terminal-install', 'terminal-dev'])
  })

  it('initializes a workspace inside the mutation queue before a concurrent transaction', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      id: 'initial-graph',
      projectId: 'project-1',
      workspaceId: 'main'
    })

    const initialization = repository.initializeDefaultGraph(projectDirectory, graph)
    const mutation = repository.transactDefaultGraph(projectDirectory, 'main', (currentGraph) =>
      currentGraph.createTerminalBlock({
        id: 'terminal-after-init',
        name: 'Terminal',
        description: '',
        position: { x: 120, y: 160 }
      })
    )
    const [initialized, committed] = await Promise.all([initialization, mutation])

    expect(initialized.blocks).toEqual([])
    expect(committed?.graph.blocks.map((block) => block.id)).toEqual(['terminal-after-init'])
    expect(
      (await repository.findDefaultGraphSnapshot(projectDirectory, 'main'))?.blocks.map(
        (block) => block.id
      )
    ).toEqual(['terminal-after-init'])
  })

  it('keeps the first initialized graph when initialization is requested twice', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const firstGraph = BlockGraph.createDefault({
      id: 'first-graph',
      projectId: 'project-1',
      workspaceId: 'main'
    })
    const secondGraph = BlockGraph.createDefault({
      id: 'second-graph',
      projectId: 'project-1',
      workspaceId: 'main'
    })

    const [first, second] = await Promise.all([
      repository.initializeDefaultGraph(projectDirectory, firstGraph),
      repository.initializeDefaultGraph(projectDirectory, secondGraph)
    ])

    expect(first.id).toBe('first-graph')
    expect(second.id).toBe('first-graph')
    expect((await repository.findDefaultGraphSnapshot(projectDirectory, 'main'))?.id).toBe(
      'first-graph'
    )
  })

  it('does not persist a failed graph transaction and keeps the workspace queue usable', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceId: 'main'
    })
    await repository.initializeDefaultGraph(projectDirectory, graph)

    await expect(
      repository.transactDefaultGraph(projectDirectory, 'main', (currentGraph) => {
        currentGraph.createTerminalBlock({
          id: 'terminal-failed',
          name: 'Failed',
          description: 'Must not be committed',
          position: { x: 120, y: 160 }
        })
        throw new Error('Stop this transaction.')
      })
    ).rejects.toThrow('Stop this transaction.')

    const recovered = await repository.transactDefaultGraph(
      projectDirectory,
      'main',
      (currentGraph) =>
        currentGraph.createTerminalBlock({
          id: 'terminal-recovered',
          name: 'Recovered',
          description: 'Committed after failure',
          position: { x: 120, y: 160 }
        })
    )

    expect(recovered?.graph.blocks.map((block) => block.id)).toEqual(['terminal-recovered'])
    expect(
      (await repository.findDefaultGraphSnapshot(projectDirectory, 'main'))?.blocks.map(
        (block) => block.id
      )
    ).toEqual(['terminal-recovered'])
  })

  it('awaits an asynchronous transaction before snapshotting and persisting its changes', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    await repository.initializeDefaultGraph(
      projectDirectory,
      BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    )

    const committed = await repository.transactDefaultGraph(
      projectDirectory,
      'main',
      async (currentGraph) => {
        await Promise.resolve()
        currentGraph.createTerminalBlock({
          id: 'terminal-async',
          name: 'Async',
          description: '',
          position: { x: 120, y: 160 }
        })
        return 'committed'
      }
    )

    expect(committed?.result).toBe('committed')
    expect(committed?.graph.blocks.map((block) => block.id)).toEqual(['terminal-async'])
  })

  it('rolls back an asynchronously rejected transaction and keeps its queue usable', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    await repository.initializeDefaultGraph(
      projectDirectory,
      BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    )

    await expect(
      repository.transactDefaultGraph(projectDirectory, 'main', async (currentGraph) => {
        currentGraph.createTerminalBlock({
          id: 'terminal-rejected',
          name: 'Rejected',
          description: '',
          position: { x: 120, y: 160 }
        })
        await Promise.resolve()
        throw new Error('Reject this transaction.')
      })
    ).rejects.toThrow('Reject this transaction.')

    const recovered = await repository.transactDefaultGraph(
      projectDirectory,
      'main',
      (currentGraph) =>
        currentGraph.createTerminalBlock({
          id: 'terminal-recovered-async',
          name: 'Recovered',
          description: '',
          position: { x: 120, y: 160 }
        })
    )

    expect(recovered?.graph.blocks.map((block) => block.id)).toEqual(['terminal-recovered-async'])
  })

  it('reports corrupted persisted graph snapshots as a stable app error', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceId: 'main'
    })

    await repository.initializeDefaultGraph(projectDirectory, graph)

    const graphPath = await findOnlyFileNamed(appStateDirectory, 'default-graph.json')

    await writeFile(graphPath, '{ "id": "graph-1" }\n}\n')

    await expect(repository.findDefaultGraphSnapshot(projectDirectory, 'main')).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'BLOCK_GRAPH_SNAPSHOT_CORRUPTED'
    )
  })
})

async function readOnlyJsonFile(directory: string, fileName: string): Promise<string> {
  return readFile(await findOnlyFileNamed(directory, fileName), 'utf8')
}

async function findOnlyFileNamed(directory: string, fileName: string): Promise<string> {
  const matches = await findFilesNamed(directory, fileName)

  expect(matches).toHaveLength(1)

  return matches[0]!
}

async function findFilesNamed(directory: string, fileName: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const matches: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      matches.push(...(await findFilesNamed(path, fileName)))
      continue
    }

    if (entry.isFile() && entry.name === fileName) {
      matches.push(path)
    }
  }

  return matches
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
