import { render, screen } from '@testing-library/react'

import type { BlockTemplateSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { BlockTemplatePlacementPreview } from '../../../../src/contexts/block-graph/presentation/components/BlockTemplatePlacementPreview'

describe('block template placement preview', () => {
  it('projects nodes and connections through the supplied canvas viewport', () => {
    const { container } = render(
      <BlockTemplatePlacementPreview
        origin={{ x: 100, y: 50 }}
        template={createTemplate('workflow')}
        viewport={{ x: 10, y: 20, zoom: 2 }}
      />
    )

    expect(screen.getByText('A').parentElement).toHaveStyle({
      left: '210px',
      top: '120px',
      width: '240px',
      height: '240px'
    })
    expect(screen.getByText('B').parentElement).toHaveStyle({ left: '610px', top: '120px' })
    const connection = container.querySelector('line')
    expect(connection).toHaveAttribute('x1', '330')
    expect(connection).toHaveAttribute('y1', '240')
    expect(connection).toHaveAttribute('x2', '730')
    expect(connection).toHaveAttribute('y2', '240')
  })

  it('projects a combination boundary from the canonical template footprint', () => {
    const { container } = render(
      <BlockTemplatePlacementPreview
        origin={{ x: 100, y: 50 }}
        template={createTemplate('combination')}
        viewport={{ x: 10, y: 20, zoom: 2 }}
      />
    )

    expect(container.querySelector('.block-template-placement-preview__group')).toHaveStyle({
      left: '146px',
      top: '-32px',
      width: '1040px',
      height: '640px'
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
