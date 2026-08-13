import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { CanvasArrangementToolbar } from '../../../src/presentation/app-shell/CanvasArrangementToolbar'
import { TooltipProvider } from '../../../src/presentation/app-shell/Tooltip'

describe('canvas arrangement toolbar', () => {
  it('explains both restrained icon actions with shared tooltips', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <CanvasArrangementToolbar
          isPending={false}
          isStacked={false}
          labels={{
            detach: '解除吸附',
            grid: '网格排列',
            stack: '吸附所选对象',
            toolbar: '整理所选画布对象'
          }}
          onGrid={vi.fn()}
          onToggleStack={vi.fn()}
        />
      </TooltipProvider>
    )

    await expectTooltip('吸附所选对象')
    await expectTooltip('网格排列')
  })

  it('switches the stack action to detach without adding visible copy', () => {
    render(
      <CanvasArrangementToolbar
        isPending={false}
        isStacked
        labels={{
          detach: '解除吸附',
          grid: '网格排列',
          stack: '吸附所选对象',
          toolbar: '整理所选画布对象'
        }}
        onGrid={vi.fn()}
        onToggleStack={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '解除吸附' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('解除吸附')).not.toBeInTheDocument()
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
