import { fireEvent, render, screen } from '@testing-library/react'

import { TerminalCanvasContextActions } from '../../../../src/contexts/block-graph/presentation/components/TerminalCanvasContextActions'

describe('terminal canvas context actions', () => {
  it('publishes workflow favorite, quick execution and removal intents', () => {
    const onAddToQuickExecution = vi.fn()
    const onClose = vi.fn()
    const onFavorite = vi.fn()
    const onRemove = vi.fn()
    const target = {
      kind: 'workflow' as const,
      selectedConnectionIds: ['connection-1'],
      selectedNodeIds: ['api', 'web'],
      terminalBlockIds: ['api', 'web']
    }

    render(
      <TerminalCanvasContextActions
        target={target}
        onAddToQuickExecution={onAddToQuickExecution}
        onClose={onClose}
        onFavorite={onFavorite}
        onRemove={onRemove}
      />
    )

    fireEvent.click(screen.getByRole('menuitem', { name: '收藏流程' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '添加到快捷执行栏' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移除流程' }))

    expect(onFavorite).toHaveBeenCalledWith(['api', 'web'])
    expect(onAddToQuickExecution).toHaveBeenCalledWith(target)
    expect(onRemove).toHaveBeenCalledWith(target)
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
