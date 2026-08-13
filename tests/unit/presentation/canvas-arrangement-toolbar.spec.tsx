import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { CanvasArrangementToolbar } from '../../../src/presentation/app-shell/CanvasArrangementToolbar'
import { TooltipProvider } from '../../../src/presentation/app-shell/Tooltip'

describe('canvas arrangement toolbar', () => {
  it('keeps the arrangement surface inert through exit and reuses it when selection returns', () => {
    const props = {
      isPending: false,
      isStacked: false,
      labels: {
        detach: '解除吸附',
        grid: '网格排列',
        stack: '吸附所选对象',
        toolbar: '整理所选画布对象'
      },
      onGrid: vi.fn(),
      onToggleStack: vi.fn()
    }
    const { rerender } = render(<CanvasArrangementToolbar {...props} open />)
    const toolbar = screen.getByRole('toolbar', { name: '整理所选画布对象' })

    expect(toolbar).toHaveAttribute('data-surface-spring-preset', 'bottom-control')

    rerender(<CanvasArrangementToolbar {...props} open={false} />)

    expect(document.querySelector('[data-canvas-arrangement-toolbar]')).toBe(toolbar)
    expect(toolbar).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(toolbar).toHaveAttribute('aria-hidden', 'true')
    expect(toolbar).toHaveAttribute('inert')

    rerender(<CanvasArrangementToolbar {...props} open />)

    expect(screen.getByRole('toolbar', { name: '整理所选画布对象' })).toBe(toolbar)
    expect(toolbar).toHaveAttribute('data-surface-motion-state', 'opening')
    expect(toolbar).not.toHaveAttribute('inert')
  })

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
