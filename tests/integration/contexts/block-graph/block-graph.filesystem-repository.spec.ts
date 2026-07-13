import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  BlockGraph,
  defaultCanvasViewport,
  defaultTerminalBlockSize
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
      workspaceName: 'main'
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

    await repository.saveDefaultGraph(projectDirectory, graph)

    const reopenedRepository = new FileSystemBlockGraphRepository(appStateDirectory)
    const openedGraph = await reopenedRepository.findDefaultGraph(projectDirectory, 'main')
    const openedSnapshot = await reopenedRepository.findDefaultGraphSnapshot(
      projectDirectory,
      'main'
    )
    const graphMetadata = JSON.parse(
      await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
    ) as { id: string }

    expect(await pathExists(join(projectDirectory, '.cleancode'))).toBe(false)
    expect(graphMetadata.id).toBe(graph.id)
    expect(openedGraph?.toSnapshot()).toEqual({
      id: graph.id,
      projectId: 'project-1',
      workspaceName: 'main',
      viewport: defaultCanvasViewport,
      blocks: [
        {
          id: terminalBlock.id,
          type: 'terminal',
          name: 'Terminal',
          description: 'Local shell',
          launchCommand: 'pnpm dev',
          position: { x: 240, y: 180 },
          size: defaultTerminalBlockSize
        },
        {
          id: secondTerminalBlock.id,
          type: 'terminal',
          name: 'Terminal 2',
          description: 'Local shell',
          launchCommand: '',
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
          size: { width: 1144, height: 512 },
          isCollapsed: false,
          memberBlockIds: [terminalBlock.id, secondTerminalBlock.id]
        }
      ]
    })
    expect(openedSnapshot).toEqual(openedGraph?.toSnapshot())
  })

  it('migrates a legacy default graph from the opened project directory', async () => {
    const legacyGraph = {
      id: 'legacy-graph',
      projectId: 'legacy-project',
      workspaceName: 'main',
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
    await writeFile(
      join(projectDirectory, '.cleancode', 'workspaces', 'main', 'default-graph.json'),
      `${JSON.stringify(legacyGraph, null, 2)}\n`
    )

    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const openedGraph = await repository.findDefaultGraph(projectDirectory, 'main')
    const openedSnapshot = await repository.findDefaultGraphSnapshot(projectDirectory, 'main')
    const migratedGraph = JSON.parse(
      await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
    ) as { id: string; blocks: Array<{ name: string }> }

    expect(openedGraph?.toSnapshot()).toEqual({
      ...legacyGraph,
      viewport: defaultCanvasViewport,
      blocks: [
        {
          ...legacyGraph.blocks[0],
          launchCommand: '',
          size: defaultTerminalBlockSize
        }
      ],
      terminalGroups: []
    })
    expect(openedSnapshot).toEqual(openedGraph?.toSnapshot())
    expect(migratedGraph.id).toBe(legacyGraph.id)
    expect(migratedGraph).toEqual(
      expect.objectContaining({
        viewport: defaultCanvasViewport,
        terminalGroups: []
      })
    )
    expect(migratedGraph.blocks).toEqual([
      expect.objectContaining({
        name: 'Legacy Terminal',
        launchCommand: '',
        size: defaultTerminalBlockSize
      })
    ])
  })

  it('keeps concurrent saves to the same graph path ordered and parseable', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const slowGraph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })
    const latestGraph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })

    for (let index = 0; index < 1_500; index += 1) {
      slowGraph.createTerminalBlock({
        name: `Slow Terminal ${index}`,
        description: 'Large snapshot',
        position: { x: index, y: index }
      })
    }
    latestGraph.createTerminalBlock({
      name: 'Latest Terminal',
      description: 'Last requested snapshot',
      position: { x: 80, y: 120 }
    })

    await Promise.all([
      repository.saveDefaultGraph(projectDirectory, slowGraph),
      repository.saveDefaultGraph(projectDirectory, latestGraph)
    ])

    const graphFile = await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
    const savedGraph = JSON.parse(graphFile) as { id: string; blocks: Array<{ name: string }> }

    expect(savedGraph.id).toBe(latestGraph.id)
    expect(savedGraph.blocks).toEqual([
      expect.objectContaining({
        name: 'Latest Terminal'
      })
    ])
  })

  it('reports corrupted persisted graph snapshots as a stable app error', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })

    await repository.saveDefaultGraph(projectDirectory, graph)

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
