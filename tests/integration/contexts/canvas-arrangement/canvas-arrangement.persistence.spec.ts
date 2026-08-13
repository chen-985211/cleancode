import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { FileSystemCanvasArrangementRepository } from '../../../../src/contexts/canvas-arrangement/infrastructure/persistence/FileSystemCanvasArrangementRepository'
import { ReconcileCanvasArrangementUseCase } from '../../../../src/contexts/canvas-arrangement/application/use-cases/ReconcileCanvasArrangementUseCase'

describe('canvas arrangement filesystem persistence', () => {
  let stateDirectory: string

  beforeEach(async () => {
    stateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-canvas-arrangement-'))
  })

  afterEach(async () => {
    await rm(stateDirectory, { recursive: true, force: true })
  })

  it('persists a mixed stack transaction and restores it after reopening', async () => {
    const repository = new FileSystemCanvasArrangementRepository(stateDirectory)

    const transaction = await repository.transactWorkspace(
      '/project',
      { projectId: 'project-1', workspaceId: 'main' },
      (arrangement) =>
        arrangement.createStack({
          id: 'stack-1',
          anchor: { x: 120, y: 80 },
          items: [
            { kind: 'terminal', terminalId: 'terminal-1' },
            { kind: 'agent', agentId: 'agent-1' }
          ]
        })
    )

    const reopened = new FileSystemCanvasArrangementRepository(stateDirectory)

    expect(transaction.snapshot.stacks).toHaveLength(1)
    await expect(reopened.findWorkspaceSnapshot('/project', 'main')).resolves.toEqual(
      transaction.snapshot
    )
  })

  it('serializes concurrent workspace mutations without dropping stacks', async () => {
    const repository = new FileSystemCanvasArrangementRepository(stateDirectory)

    await Promise.all(
      [1, 2].map((number) =>
        repository.transactWorkspace(
          '/project',
          { projectId: 'project-1', workspaceId: 'main' },
          (arrangement) =>
            arrangement.createStack({
              id: `stack-${number}`,
              anchor: { x: number * 100, y: 80 },
              items: [
                { kind: 'terminal', terminalId: `terminal-${number}-a` },
                { kind: 'terminal', terminalId: `terminal-${number}-b` }
              ]
            })
        )
      )
    )

    await expect(repository.findWorkspaceSnapshot('/project', 'main')).resolves.toMatchObject({
      stacks: [{ id: 'stack-1' }, { id: 'stack-2' }]
    })
  })

  it('rejects unknown schema versions and mismatched workspace identity', async () => {
    const filePath = arrangementPath(stateDirectory, '/project', 'main')
    await mkdir(resolve(filePath, '..'), { recursive: true })
    await writeFile(
      filePath,
      JSON.stringify({
        version: 4,
        arrangement: { projectId: 'project-1', workspaceId: 'main', stacks: [] }
      })
    )

    const repository = new FileSystemCanvasArrangementRepository(stateDirectory)
    await expect(repository.findWorkspaceSnapshot('/project', 'main')).rejects.toThrow(
      'Unsupported canvas arrangement store version.'
    )

    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        arrangement: { projectId: 'project-1', workspaceId: 'other', stacks: [] }
      })
    )
    await expect(repository.findWorkspaceSnapshot('/project', 'main')).rejects.toThrow(
      'Canvas arrangement workspace identity does not match its storage scope.'
    )
  })

  it('writes the strict versioned envelope', async () => {
    const repository = new FileSystemCanvasArrangementRepository(stateDirectory)
    await repository.transactWorkspace(
      '/project',
      { projectId: 'project-1', workspaceId: 'main' },
      () => undefined
    )

    const contents = JSON.parse(
      await readFile(arrangementPath(stateDirectory, '/project', 'main'), 'utf8')
    )

    expect(contents).toEqual({
      version: 3,
      arrangement: { projectId: 'project-1', workspaceId: 'main', stacks: [] }
    })
  })

  it('restores a version-one stack as an attached relation', async () => {
    const filePath = arrangementPath(stateDirectory, '/project', 'main')
    await mkdir(resolve(filePath, '..'), { recursive: true })
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        arrangement: {
          projectId: 'project-1',
          workspaceId: 'main',
          stacks: [
            {
              id: 'stack-1',
              anchor: { x: 120, y: 80 },
              items: [
                { kind: 'terminal', terminalId: 'terminal-1' },
                { kind: 'agent', agentId: 'agent-1' }
              ]
            }
          ]
        }
      })
    )

    const repository = new FileSystemCanvasArrangementRepository(stateDirectory)
    const restored = await repository.findWorkspaceSnapshot('/project', 'main')

    expect(restored?.stacks).toEqual([
      {
        id: 'stack-1',
        anchor: { x: 120, y: 80 },
        items: [
          { kind: 'terminal', terminalId: 'terminal-1' },
          { kind: 'agent', agentId: 'agent-1' }
        ]
      }
    ])
  })

  it('keeps attached version-two stacks and treats spread stacks as already detached', async () => {
    const filePath = arrangementPath(stateDirectory, '/project', 'main')
    await mkdir(resolve(filePath, '..'), { recursive: true })
    await writeFile(
      filePath,
      JSON.stringify({
        version: 2,
        arrangement: {
          projectId: 'project-1',
          workspaceId: 'main',
          stacks: [
            {
              id: 'attached-stack',
              anchor: { x: 120, y: 80 },
              presentation: 'stacked',
              items: [
                { kind: 'terminal', terminalId: 'terminal-1' },
                { kind: 'agent', agentId: 'agent-1' }
              ]
            },
            {
              id: 'detached-stack',
              anchor: { x: 320, y: 180 },
              presentation: 'spread',
              items: [
                { kind: 'terminal', terminalId: 'terminal-2' },
                { kind: 'agent', agentId: 'agent-2' }
              ]
            }
          ]
        }
      })
    )

    const repository = new FileSystemCanvasArrangementRepository(stateDirectory)

    await expect(repository.findWorkspaceSnapshot('/project', 'main')).resolves.toEqual({
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'attached-stack',
          anchor: { x: 120, y: 80 },
          items: [
            { kind: 'terminal', terminalId: 'terminal-1' },
            { kind: 'agent', agentId: 'agent-1' }
          ]
        }
      ]
    })
  })

  it('persists stale-member cleanup when a workspace is restored', async () => {
    const repository = new FileSystemCanvasArrangementRepository(stateDirectory)
    await repository.transactWorkspace(
      '/project',
      { projectId: 'project-1', workspaceId: 'main' },
      (arrangement) =>
        arrangement.createStack({
          id: 'stack-1',
          anchor: { x: 120, y: 80 },
          items: [
            { kind: 'terminal', terminalId: 'terminal-1' },
            { kind: 'agent', agentId: 'agent-1' },
            { kind: 'combination', terminalGroupId: 'deleted-group' }
          ]
        })
    )
    const reconcile = new ReconcileCanvasArrangementUseCase(repository)

    const snapshot = await reconcile.execute({
      projectDirectory: '/project',
      projectId: 'project-1',
      validItemKeys: ['terminal:terminal-1', 'agent:agent-1'],
      workspaceId: 'main'
    })

    expect(snapshot.stacks[0]?.items).toEqual([
      { kind: 'terminal', terminalId: 'terminal-1' },
      { kind: 'agent', agentId: 'agent-1' }
    ])
    await expect(repository.findWorkspaceSnapshot('/project', 'main')).resolves.toEqual(snapshot)
  })
})

function arrangementPath(root: string, projectDirectory: string, workspaceId: string): string {
  const projectKey = createHash('sha256').update(resolve(projectDirectory)).digest('hex')
  return join(
    root,
    'projects',
    projectKey,
    'workspaces',
    encodeURIComponent(workspaceId),
    'canvas-arrangement.json'
  )
}
