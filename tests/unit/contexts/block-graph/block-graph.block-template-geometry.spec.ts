import type { BlockTemplateSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockTemplateSnapshot'
import {
  projectBlockTemplateRects,
  resolveBlockTemplateBounds
} from '../../../../src/contexts/block-graph/presentation/view-models/blockTemplateGeometry'

describe('block template presentation geometry', () => {
  it('projects every workflow node without changing its relative layout', () => {
    const template = createTemplate('workflow')

    expect(projectBlockTemplateRects(template, { x: 100, y: 50 })).toEqual([
      {
        id: 'node-a',
        position: { x: 100, y: 50 },
        size: { width: 120, height: 120 }
      },
      {
        id: 'node-b',
        position: { x: 300, y: 50 },
        size: { width: 120, height: 120 }
      }
    ])
    expect(resolveBlockTemplateBounds(template, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 320,
      height: 120
    })
  })

  it('projects a combination as one padded minimum-size group footprint', () => {
    const template = createTemplate('combination')

    expect(projectBlockTemplateRects(template, { x: 100, y: 50 })).toEqual([
      {
        id: 'template-1',
        position: { x: 68, y: -26 },
        size: { width: 520, height: 320 }
      }
    ])
    expect(resolveBlockTemplateBounds(template, { x: 100, y: 50 })).toEqual({
      x: 68,
      y: -26,
      width: 520,
      height: 320
    })
  })
})

function createTemplate(type: BlockTemplateSnapshot['type']): BlockTemplateSnapshot {
  return {
    id: 'template-1',
    type,
    name: 'Build',
    description: '',
    scope: { type: 'global' },
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'node-a',
        name: 'A',
        description: '',
        launchCommand: 'pnpm a',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 120, height: 120 }
      },
      {
        templateNodeId: 'node-b',
        name: 'B',
        description: '',
        launchCommand: 'pnpm b',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 200, y: 0 },
        size: { width: 120, height: 120 }
      }
    ],
    connections: [{ sourceTemplateNodeId: 'node-a', targetTemplateNodeId: 'node-b' }]
  }
}
