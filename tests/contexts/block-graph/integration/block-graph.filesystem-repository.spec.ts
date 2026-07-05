import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { FileSystemBlockGraphRepository } from '../../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'

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

    await repository.saveDefaultGraph(projectDirectory, graph)

    const openedGraph = await new FileSystemBlockGraphRepository(
      appStateDirectory
    ).findDefaultGraph(projectDirectory, 'main')
    const graphMetadata = JSON.parse(
      await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
    ) as { id: string }

    expect(await pathExists(join(projectDirectory, '.cleancode'))).toBe(false)
    expect(graphMetadata.id).toBe(graph.id)
    expect(openedGraph?.toSnapshot()).toEqual({
      id: graph.id,
      projectId: 'project-1',
      workspaceName: 'main',
      blocks: [
        {
          id: terminalBlock.id,
          type: 'terminal',
          name: 'Terminal',
          description: 'Local shell',
          position: { x: 240, y: 180 }
        }
      ]
    })
  })

  it('migrates a legacy default graph from the opened project directory', async () => {
    const graph = BlockGraph.createDefault({
      projectId: 'legacy-project',
      workspaceName: 'main'
    })

    graph.createTerminalBlock({
      name: 'Legacy Terminal',
      description: '本地终端',
      position: { x: 300, y: 220 }
    })
    await mkdir(join(projectDirectory, '.cleancode', 'workspaces', 'main'), {
      recursive: true
    })
    await writeFile(
      join(projectDirectory, '.cleancode', 'workspaces', 'main', 'default-graph.json'),
      `${JSON.stringify(graph.toSnapshot(), null, 2)}\n`
    )

    const openedGraph = await new FileSystemBlockGraphRepository(
      appStateDirectory
    ).findDefaultGraph(projectDirectory, 'main')
    const migratedGraph = JSON.parse(
      await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
    ) as { id: string; blocks: Array<{ name: string }> }

    expect(openedGraph?.toSnapshot()).toEqual(graph.toSnapshot())
    expect(migratedGraph.id).toBe(graph.id)
    expect(migratedGraph.blocks.map((block) => block.name)).toEqual(['Legacy Terminal'])
  })
})

async function readOnlyJsonFile(directory: string, fileName: string): Promise<string> {
  const matches = await findFilesNamed(directory, fileName)

  expect(matches).toHaveLength(1)

  return readFile(matches[0]!, 'utf8')
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
