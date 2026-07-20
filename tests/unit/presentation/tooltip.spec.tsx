import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  Tooltip,
  TooltipContent,
  TooltipLabel,
  TooltipProvider,
  TooltipTrigger
} from '../../../src/presentation/app-shell/Tooltip'

describe('tooltip', () => {
  it('portals a non-interactive label while preserving the trigger semantics', async () => {
    const onClick = vi.fn()
    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="nodrag" type="button" aria-label="打开设置" onClick={onClick}>
              设置
            </button>
          </TooltipTrigger>
          <TooltipContent>打开设置</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByRole('button', { name: '打开设置' })
    expect(trigger).toHaveClass('nodrag')
    expect(trigger).not.toHaveAttribute('title')

    fireEvent.focus(trigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('打开设置')
    const tooltipSurface = document.querySelector<HTMLElement>('.cc-tooltip-content')
    expect(tooltipSurface).toHaveTextContent('打开设置')
    expect(container).not.toContainElement(tooltipSurface)
    expect(document.body).toContainElement(tooltipSurface)

    fireEvent.click(trigger)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('closes a focused tooltip when Escape is pressed', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button">切换侧栏</button>
          </TooltipTrigger>
          <TooltipContent>切换侧栏</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByRole('button', { name: '切换侧栏' })
    fireEvent.focus(trigger)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })

  it('does not open when application focus management moves focus after pointer input', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <TooltipLabel content="返回工作区">
          <button type="button">返回工作区</button>
        </TooltipLabel>
      </TooltipProvider>
    )

    const trigger = screen.getByRole('button', { name: '返回工作区' })
    fireEvent.pointerDown(document.body, { pointerType: 'mouse' })
    fireEvent.focus(trigger)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('still opens when the pointer rests on the trigger', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <TooltipLabel content="收起侧边栏">
          <button type="button">收起侧边栏</button>
        </TooltipLabel>
      </TooltipProvider>
    )

    fireEvent.pointerMove(screen.getByRole('button', { name: '收起侧边栏' }), {
      pointerType: 'mouse'
    })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('收起侧边栏')
  })

  it('still opens for focus reached through keyboard navigation', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <TooltipLabel content="返回工作区">
          <button type="button">返回工作区</button>
        </TooltipLabel>
      </TooltipProvider>
    )

    const trigger = screen.getByRole('button', { name: '返回工作区' })
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(trigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('返回工作区')
  })
})
