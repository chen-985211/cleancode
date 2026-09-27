import { act, fireEvent, render, screen } from '@testing-library/react'

import { TerminalMetadataForm } from '../../../../src/contexts/block-graph/presentation/components/TerminalMetadataForm'
import { motionPreferenceStore } from '../../../../src/presentation/shared/motion/motionPreference'

const block = {
  id: 'terminal-1',
  type: 'terminal' as const,
  name: 'Build',
  description: '',
  launchCommand: 'pnpm build',
  position: { x: 0, y: 0 },
  size: { width: 560, height: 360 }
}

function editor(open: boolean) {
  return (
    <TerminalMetadataForm
      {...{ open }}
      block={block}
      shouldFocusLaunchCommand={false}
      onSave={vi.fn(async () => undefined)}
      onCancel={vi.fn()}
    />
  )
}

describe('terminal metadata motion', () => {
  let frames: ReturnType<typeof createFrames>
  let reduced: boolean
  let listeners: Set<() => void>

  beforeEach(() => {
    frames = createFrames()
    reduced = false
    listeners = new Set()
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockImplementation(() => reduced)
    vi.spyOn(motionPreferenceStore, 'subscribe').mockImplementation((listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
  })

  it('reverses the live surface, isolates its exit, and discards the cancelled draft on immediate reopen', () => {
    const view = render(editor(true))
    const form = screen.getByRole('form')
    const surface = form.closest('.terminal-metadata-surface')!
    expect(surface).not.toBeNull()
    frames.advance(80)
    const opacity = Number(
      (surface as HTMLElement).style.getPropertyValue('--cc-surface-motion-opacity')
    )
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThan(1)
    fireEvent.change(screen.getByLabelText('终端名称'), { target: { value: 'Draft' } })
    view.rerender(editor(false))
    expect(surface).toHaveAttribute('inert')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    frames.advance(40)
    const closingOpacity = (surface as HTMLElement).style.getPropertyValue(
      '--cc-surface-motion-opacity'
    )
    view.rerender(editor(true))
    expect(screen.getByRole('form').closest('.terminal-metadata-surface')).toBe(surface)
    expect(surface).not.toHaveAttribute('inert')
    expect((surface as HTMLElement).style.getPropertyValue('--cc-surface-motion-opacity')).toBe(
      closingOpacity
    )
    expect(screen.getByLabelText('终端名称')).toHaveValue('Build')
    expect(screen.getByLabelText('终端名称')).toHaveFocus()
    frames.advance(1000)
    view.rerender(editor(false))
    frames.advance(1000)
    expect(surface).not.toBeInTheDocument()
    view.rerender(editor(true))
    expect(screen.getByLabelText('终端名称')).toHaveValue('Build')
    view.unmount()
    expect(frames.pending()).toBe(0)
  })

  it('retains and reverses task fields without keeping exiting controls accessible', () => {
    render(editor(true))
    frames.advance(1000)
    const timeout = screen.getByRole('textbox', { name: '任务超时' })
    fireEvent.change(timeout, { target: { value: '600' } })
    fireEvent.click(screen.getByRole('radio', { name: '服务' }))
    const exiting = timeout.closest('[data-terminal-fields-motion]')!
    expect(exiting).toHaveAttribute('inert')
    expect(timeout).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '任务超时' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '服务就绪方式' })).toBeInTheDocument()
    frames.advance(60)
    const height = (exiting as HTMLElement).style.height
    expect(Number.parseFloat(height)).toBeGreaterThan(0)
    expect(Number.parseFloat(height)).toBeLessThan(120)
    fireEvent.click(screen.getByRole('radio', { name: '任务' }))
    expect(screen.getByRole('textbox', { name: '任务超时' })).toBe(timeout)
    expect((exiting as HTMLElement).style.height).toBe(height)
    expect(timeout).toHaveValue('600')
    frames.advance(1000)
    expect(screen.queryByLabelText('服务就绪方式')).not.toBeInTheDocument()
  })

  it('animates readiness, managed-port and binding fields with immediate selection semantics', () => {
    render(editor(true))
    fireEvent.click(screen.getByRole('radio', { name: '服务' }))
    frames.advance(1000)
    const readinessText = screen.getByRole('textbox', { name: '服务就绪文本' })
    choose('服务就绪方式', 'tcp')
    expect(readinessText).toBeInTheDocument()
    expect(readinessText.closest('[data-terminal-fields-motion]')).toHaveAttribute('inert')
    expect(screen.queryByRole('textbox', { name: '服务就绪文本' })).not.toBeInTheDocument()
    choose('端口策略', 'preferred')
    const environment = screen.getByRole('textbox', { name: '环境变量名称' })
    frames.advance(1000)
    expect(readinessText).not.toBeInTheDocument()
    choose('端口注入方式', 'argument')
    expect(environment).toBeInTheDocument()
    expect(environment.closest('[data-terminal-fields-motion]')).toHaveAttribute('inert')
    expect(screen.getByRole('textbox', { name: '端口参数后缀' })).toBeInTheDocument()
    frames.advance(1000)
    expect(environment).not.toBeInTheDocument()
    const port = screen.getByRole('textbox', { name: '服务端口' })
    choose('端口策略', 'unmanaged')
    expect(port).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '服务端口' })).not.toBeInTheDocument()
    frames.advance(1000)
    expect(port).not.toBeInTheDocument()
  })

  it('settles pending field and editor exits when reduced motion changes', () => {
    const view = render(editor(true))
    frames.advance(1000)
    const task = screen.getByLabelText('任务超时')
    fireEvent.click(screen.getByRole('radio', { name: '服务' }))
    frames.advance(40)
    act(() => {
      reduced = true
      listeners.forEach((listener) => listener())
    })
    expect(task).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '服务就绪方式' })).toBeInTheDocument()
    view.rerender(editor(false))
    expect(screen.queryByRole('form', { hidden: true })).not.toBeInTheDocument()
    expect(frames.pending()).toBe(0)
  })
})

function choose(label: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
  fireEvent.click(screen.getByRole('menu').querySelector(`[data-choice-value="${value}"]`)!)
}

function createFrames() {
  let now = 0
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.spyOn(window.performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.set(++nextId, callback)
    return nextId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => callbacks.delete(id))
  return {
    pending: () => callbacks.size,
    advance: (milliseconds: number) => {
      const end = now + milliseconds
      while (now < end) {
        now = Math.min(now + 16, end)
        const pending = [...callbacks.values()]
        callbacks.clear()
        act(() => pending.forEach((callback) => callback(now)))
      }
    }
  }
}
