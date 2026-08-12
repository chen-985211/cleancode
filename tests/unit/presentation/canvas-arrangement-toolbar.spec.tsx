import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { CanvasArrangementToolbar } from '../../../src/presentation/app-shell/CanvasArrangementToolbar'
import { TooltipProvider } from '../../../src/presentation/app-shell/Tooltip'

describe('canvas arrangement toolbar', () => {
  it('explains both restrained icon actions with shared tooltips', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <CanvasArrangementToolbar
          isPending={false}
          stackPresentation={null}
          labels={{
            collapse: '收拢堆叠',
            expand: '展开堆叠',
            grid: '网格排列',
            stack: '堆叠所选对象',
            toolbar: '整理所选画布对象'
          }}
          onGrid={vi.fn()}
          onToggleStack={vi.fn()}
        />
      </TooltipProvider>
    )

    await expectTooltip('堆叠所选对象')
    await expectTooltip('网格排列')
  })

  it('switches the stack action from spread to collapse without adding visible copy', () => {
    render(
      <CanvasArrangementToolbar
        isPending={false}
        stackPresentation="spread"
        labels={{
          collapse: '收拢堆叠',
          expand: '展开堆叠',
          grid: '网格排列',
          stack: '堆叠所选对象',
          toolbar: '整理所选画布对象'
        }}
        onGrid={vi.fn()}
        onToggleStack={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '收拢堆叠' })).toBeInTheDocument()
    expect(screen.queryByText('收拢堆叠')).not.toBeInTheDocument()
  })
})

async function expectTooltip(label: string): Promise<void> {
  const button = screen.getByRole('button', { name: label })
  expect(button).not.toHaveAttribute('title')
  fireEvent.pointerMove(button, { pointerType: 'mouse' })
  expect(await screen.findByRole('tooltip')).toHaveTextContent(label)
  fireEvent.pointerLeave(button, { pointerType: 'mouse' })
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
}
