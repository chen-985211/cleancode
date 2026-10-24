import { mkdtemp, rename, rm } from 'node:fs/promises'
import type * as fsPromises from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileSystemCanvasArrangementRepository } from '../../../../src/contexts/canvas-arrangement/infrastructure/persistence/FileSystemCanvasArrangementRepository'
import { SaveCanvasLayerOrderUseCase } from '../../../../src/contexts/canvas-arrangement/application/use-cases/SaveCanvasLayerOrderUseCase'
import { createCanvasArrangementRuntime } from '../../../../src/platform/electron-main/canvasArrangementRuntimeComposition'
import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

const items = [
  { kind: 'terminal' as const, terminalId: 'b' },
  { kind: 'combination' as const, terminalGroupId: 'group' },
  { kind: 'terminal' as const, terminalId: 'a' }
]
const scope = { projectDirectory: '/project', projectId: 'project', workspaceId: 'main' }

describe('workspace layer order filesystem boundary', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-layer-order-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('restores each project and workspace independently after reopening the repository', async () => {
    const save = new SaveCanvasLayerOrderUseCase(
      new FileSystemCanvasArrangementRepository(directory)
    )
    await save.execute({ ...scope, items })
    await save.execute({ ...scope, workspaceId: 'other', items: [...items].reverse() })
    await save.execute({
      ...scope,
      projectDirectory: '/another-project',
      projectId: 'other',
      items: [items[0]!]
    })
    const reopened = new FileSystemCanvasArrangementRepository(directory)
    expect((await reopened.findWorkspaceSnapshot('/project', 'main'))?.layerOrder).toEqual(items)
    expect((await reopened.findWorkspaceSnapshot('/project', 'other'))?.layerOrder).toEqual(
      [...items].reverse()
    )
    expect((await reopened.findWorkspaceSnapshot('/another-project', 'main'))?.layerOrder).toEqual([
      items[0]
    ])
  })

  it('serializes concurrent stack and order writes without overwriting either fact', async () => {
    const repo = new FileSystemCanvasArrangementRepository(directory)
    const save = new SaveCanvasLayerOrderUseCase(
      new FileSystemCanvasArrangementRepository(directory)
    )
    await Promise.all([
      save.execute({ ...scope, items }),
      repo.transactWorkspace('/project', scope, (arrangement) =>
        arrangement.createStack({
          id: 'stack',
          anchor: { x: 30, y: 40 },
          items: [items[0]!, items[1]!]
        })
      )
    ])
    expect(await repo.findWorkspaceSnapshot('/project', 'main')).toMatchObject({
      layerOrder: items,
      stacks: [{ id: 'stack', anchor: { x: 30, y: 40 } }]
    })
    await expect(save.execute({ ...scope, items: [items[0]!, items[0]!] })).rejects.toThrow()
    expect((await repo.findWorkspaceSnapshot('/project', 'main'))?.layerOrder).toEqual(items)
  })

  it('restores live hidden members and atomically prunes deleted identities even without stacks', async () => {
    const repo = new FileSystemCanvasArrangementRepository(directory)
    await new SaveCanvasLayerOrderUseCase(repo).execute({
      ...scope,
      items: [...items, { kind: 'agent', agentId: 'deleted' }]
    })
    const restored = await createCanvasArrangementRuntime(directory).loadWorkspace({
      ...scope,
      agents: [],
      graph: {
        blocks: [{ id: 'a' }, { id: 'b' }],
        terminalGroups: [{ id: 'group', memberBlockIds: ['a'], isCollapsed: true }],
        connections: []
      } as unknown as BlockGraphSnapshot
    })
    expect(restored.layerOrder).toEqual(items)
    expect(
      (
        await new FileSystemCanvasArrangementRepository(directory).findWorkspaceSnapshot(
          '/project',
          'main'
        )
      )?.layerOrder
    ).toEqual(items)
  })

  it('retains the previous durable order if atomic replacement fails and permits a later save', async () => {
    const repo = new FileSystemCanvasArrangementRepository(directory)
    const save = new SaveCanvasLayerOrderUseCase(repo)
    await save.execute({ ...scope, items })
    vi.mocked(rename).mockRejectedValueOnce(
      Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    )
    await expect(save.execute({ ...scope, items: [...items].reverse() })).rejects.toThrow(
      'disk full'
    )
    expect((await repo.findWorkspaceSnapshot('/project', 'main'))?.layerOrder).toEqual(items)
    await save.execute({ ...scope, items: [...items].reverse() })
    expect((await repo.findWorkspaceSnapshot('/project', 'main'))?.layerOrder).toEqual(
      [...items].reverse()
    )
  })
})
