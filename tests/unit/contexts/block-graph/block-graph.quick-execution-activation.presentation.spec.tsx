import { fireEvent, render, screen } from '@testing-library/react'

import type {
  BlockGraphSnapshot,
  QuickExecutionTargetSnapshot
} from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { QuickExecutionBar } from '../../../../src/contexts/block-graph/presentation/components/QuickExecutionBar'

const targets: readonly QuickExecutionTargetSnapshot[] = [
  { type: 'terminal', terminalBlockId: 'worker' },
  { type: 'workflow', terminalBlockIds: ['api', 'web'] },
  { type: 'combination', terminalGroupId: 'development' }
]

describe('quick execution slot activation', () => {
  it.each(
    targets.flatMap((target) => ['dock', 'arrangement'].map((surface) => ({ target, surface })))
  )(
    'locates on a single click and executes once on a double click ($target.type, $surface)',
    ({ target, surface }) => {
      const onFocus = vi.fn()
      const onExecute = vi.fn()
      render(
        <QuickExecutionBar
          graph={createGraph(target)}
          onAdd={vi.fn()}
          onClear={vi.fn()}
          onFocus={onFocus}
          onExecute={onExecute}
          onReorder={vi.fn()}
        />
      )
      if (surface === 'arrangement') {
        fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
        fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))
      }
      const button = document.querySelector<HTMLButtonElement>(
        `[data-quick-execution-slots="${surface}"] [data-quick-execution-slot="1"] button`
      )!

      fireEvent.click(button, { detail: 1 })
      expect(onFocus).toHaveBeenCalledExactlyOnceWith(target)
      expect(onExecute).not.toHaveBeenCalled()

      // Browsers emit two clicks before dblclick. Only the second click executes.
      fireEvent.click(button, { detail: 2 })
      fireEvent.doubleClick(button, { detail: 2 })
      expect(onExecute).toHaveBeenCalledExactlyOnceWith(target)
      expect(onFocus).toHaveBeenCalledOnce()

      // Keyboard button activation remains a locate action; extra clicks do not rerun.
      fireEvent.click(button, { detail: 0 })
      fireEvent.click(button, { detail: 3 })
      expect(onFocus).toHaveBeenCalledTimes(2)
      expect(onExecute).toHaveBeenCalledOnce()
    }
  )
})

function createGraph(target: QuickExecutionTargetSnapshot): BlockGraphSnapshot {
  return {
    id: 'graph',
    projectId: 'project',
    workspaceId: 'workspace',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: ['worker', 'api', 'web'].map((id) => ({
      id,
      name: id,
      description: '',
      launchCommand: `pnpm ${id}`,
      type: 'terminal',
      position: { x: 0, y: 0 },
      size: { width: 420, height: 280 },
      executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
    })),
    connections: [{ id: 'api-web', sourceBlockId: 'api', targetBlockId: 'web' }],
    terminalGroups: [
      {
        id: 'development',
        name: 'Development',
        type: 'terminal-group',
        isCollapsed: false,
        memberBlockIds: ['api', 'web'],
        position: { x: 0, y: 0 },
        size: { width: 900, height: 400 }
      }
    ],
    quickExecutionSlots: ([1, 2, 3, 4, 5] as const).map((number) => ({
      number,
      target: number === 1 ? target : null
    }))
  }
}
