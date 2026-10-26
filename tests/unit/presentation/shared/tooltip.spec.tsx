import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  Tooltip,
  TooltipContent,
  TooltipLabel,
  TooltipProvider,
  TooltipTrigger
} from '../../../../src/presentation/shared/components/Tooltip'

describe('tooltip', () => {
  it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'blur'])(
    'suppresses pointer gestures until fresh hover after %s',
    async (finish) => {
      render(
        <TooltipProvider delayDuration={0}>
          <TooltipLabel content="节点名称">
            <button type="button">节点名称</button>
          </TooltipLabel>
          <TooltipLabel content="另一个节点">
            <button type="button">另一个节点</button>
          </TooltipLabel>
        </TooltipProvider>
      )
      const trigger = screen.getByRole('button', { name: '节点名称' })
      const otherTrigger = screen.getByRole('button', { name: '另一个节点' })
      fireEvent.pointerMove(trigger, { pointerType: 'mouse', buttons: 0 })
      expect(await screen.findByRole('tooltip')).toHaveTextContent('节点名称')

      fireEvent.pointerDown(document.body, { pointerType: 'mouse', buttons: 1 })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      fireEvent.pointerLeave(trigger)
      fireEvent.pointerMove(otherTrigger, { pointerType: 'mouse', buttons: 1 })
      fireEvent.focus(otherTrigger)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      if (finish === 'blur') fireEvent.blur(window)
      else if (finish === 'pointerup') fireEvent.pointerUp(document.body)
      else if (finish === 'pointercancel') fireEvent.pointerCancel(document.body)
      else fireEvent.lostPointerCapture(document.body)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      fireEvent.pointerLeave(otherTrigger)
      fireEvent.pointerMove(otherTrigger, { pointerType: 'mouse', buttons: 0 })
      expect(await screen.findByRole('tooltip')).toHaveTextContent('另一个节点')
    }
  )

  it('discards pending hover when a pointer gesture starts', async () => {
    vi.useFakeTimers()
    try {
      render(
        <TooltipProvider delayDuration={400}>
          <TooltipLabel content="节点名称">
            <button type="button">节点名称</button>
          </TooltipLabel>
        </TooltipProvider>
      )
      const trigger = screen.getByRole('button', { name: '节点名称' })
      fireEvent.pointerMove(trigger, { pointerType: 'mouse', buttons: 0 })
      await act(async () => vi.advanceTimersByTimeAsync(200))
      fireEvent.pointerDown(document.body, { pointerType: 'mouse', buttons: 1 })
      fireEvent.pointerMove(trigger, { pointerType: 'mouse', buttons: 1 })
      await act(async () => vi.advanceTimersByTimeAsync(500))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      fireEvent.pointerUp(document.body, { pointerType: 'mouse', buttons: 0 })
      await act(async () => vi.advanceTimersByTimeAsync(500))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      fireEvent.pointerLeave(trigger)
      fireEvent.pointerMove(trigger, { pointerType: 'mouse', buttons: 0 })
      await act(async () => vi.advanceTimersByTimeAsync(500))
      expect(screen.getByRole('tooltip')).toHaveTextContent('节点名称')
    } finally {
      vi.useRealTimers()
    }
  })

  it('restores keyboard tooltips after releasing a pointer gesture', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <TooltipLabel content="节点名称">
          <button type="button">节点名称</button>
        </TooltipLabel>
      </TooltipProvider>
    )
    const trigger = screen.getByRole('button', { name: '节点名称' })
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', buttons: 1 })
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.blur(trigger)
    fireEvent.pointerUp(document.body, { pointerType: 'mouse', buttons: 0 })
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(trigger)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('节点名称')
  })

  it('dismisses a suspended pointer tooltip and requires fresh hover after the gesture', async () => {
    const content = (disabled: boolean) => (
      <TooltipProvider delayDuration={0}>
        <TooltipLabel content="快捷位" disabled={disabled}>
          <button type="button">快捷位</button>
        </TooltipLabel>
      </TooltipProvider>
    )
    const { rerender } = render(content(false))
    const trigger = screen.getByRole('button', { name: '快捷位' })
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    rerender(content(true))
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    rerender(content(false))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.pointerLeave(trigger)
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

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
