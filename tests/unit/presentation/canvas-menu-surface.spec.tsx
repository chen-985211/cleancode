import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'

import {
  CanvasMenuMotionProvider,
  CanvasMenuSurface
} from '../../../src/presentation/app-shell/CanvasMenuMotionProvider'
import type { CanvasMenuMotionFrameScheduler } from '../../../src/presentation/app-shell/canvasMenuMotion'

const canvasMenuStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/canvas-object-context-menu.css'),
  'utf8'
)

describe('canvas menu surface', () => {
  it('keeps a closing menu mounted but removes it from interaction until the spring settles', () => {
    const scheduler = new TestFrameScheduler()
    render(<MenuHarness scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const menu = screen.getByRole('menu', { name: '测试菜单' })
    act(() => scheduler.step())
    fireEvent.click(screen.getByRole('button', { name: '关闭菜单' }))

    expect(menu).toBeInTheDocument()
    expect(menu).toHaveAttribute('data-motion-state', 'closing')
    expect(menu).toHaveAttribute('data-interactive', 'false')
    expect(menu).toHaveAttribute('aria-hidden', 'true')

    act(() => scheduler.finish())
    expect(screen.queryByRole('menu', { name: '测试菜单', hidden: true })).not.toBeInTheDocument()
  })

  it('reuses the live surface when closing reverses into opening', () => {
    const scheduler = new TestFrameScheduler()
    render(<MenuHarness scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const menu = screen.getByRole('menu', { name: '测试菜单' })
    act(() => scheduler.step())
    fireEvent.click(screen.getByRole('button', { name: '关闭菜单' }))
    act(() => scheduler.step())
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))

    expect(screen.getByRole('menu', { name: '测试菜单' })).toBe(menu)
    expect(menu).toHaveAttribute('data-motion-state', 'opening')
    expect(menu).toHaveAttribute('data-interactive', 'true')
    act(() => scheduler.finish())
    expect(menu).toHaveAttribute('data-motion-state', 'open')
  })

  it('grows from a compact anchored surface and visibly shrinks along the same path', () => {
    const scheduler = new TestFrameScheduler()
    render(<MenuHarness scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const menu = screen.getByRole('menu', { name: '测试菜单' })
    expect(readMenuScale(menu)).toBeGreaterThanOrEqual(0.7)
    expect(readMenuScale(menu)).toBeLessThan(0.8)

    for (let frame = 0; frame < 6; frame += 1) act(() => scheduler.step())
    expect(readMenuScale(menu)).toBeGreaterThan(0.82)
    expect(readMenuScale(menu)).toBeLessThan(0.9)

    act(() => scheduler.finish())
    fireEvent.click(screen.getByRole('button', { name: '关闭菜单' }))
    for (let frame = 0; frame < 6; frame += 1) act(() => scheduler.step())

    expect(readMenuScale(menu)).toBeGreaterThan(0.82)
    expect(readMenuScale(menu)).toBeLessThan(0.9)
  })

  it('closes the previous interactive menu when another canvas menu opens', () => {
    const scheduler = new TestFrameScheduler()
    render(<TwoMenuHarness scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单一' }))
    fireEvent.click(screen.getByRole('button', { name: '打开菜单二' }))

    expect(document.querySelector('[role="menu"][aria-label="菜单一"]')).toHaveAttribute(
      'data-interactive',
      'false'
    )
    expect(screen.getByRole('menu', { name: '菜单二' })).toHaveAttribute('data-interactive', 'true')
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })

  it('keeps the input-consuming dismiss layer visually transparent', () => {
    const scheduler = new TestFrameScheduler()
    const onCanvasPointerDown = vi.fn()
    render(
      <div onPointerDown={onCanvasPointerDown}>
        <MenuHarness scheduler={scheduler} />
      </div>
    )

    const dismissLayer = screen.getByTestId('canvas-menu-dismiss-layer')
    const dismissLayerRule = readStyleRule(canvasMenuStyles, '.canvas-menu-dismiss-layer')
    expect(dismissLayerRule).not.toMatch(/\b(?:background|opacity|backdrop-filter):/)
    expect(dismissLayerRule).not.toContain('will-change')
    expect(dismissLayer.style.getPropertyValue('--canvas-menu-backdrop-progress')).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    act(() => scheduler.step())

    expect(dismissLayer.style.getPropertyValue('--canvas-menu-backdrop-progress')).toBe('')
    expect(dismissLayer).toHaveStyle('pointer-events: auto')

    fireEvent.pointerDown(dismissLayer, { button: 0, pointerId: 1 })

    expect(screen.queryByRole('menu', { name: '测试菜单' })).not.toBeInTheDocument()
    expect(onCanvasPointerDown).not.toHaveBeenCalled()
  })

  it('dismisses on a repeated secondary click without leaking a native context menu', () => {
    const scheduler = new TestFrameScheduler()
    render(<MenuHarness scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const dismissLayer = screen.getByTestId('canvas-menu-dismiss-layer')

    fireEvent.pointerDown(dismissLayer, { button: 2, pointerId: 2 })
    expect(screen.queryByRole('menu', { name: '测试菜单' })).not.toBeInTheDocument()
    expect(dismissLayer).toHaveStyle('pointer-events: auto')

    const contextMenuEvent = createEvent.contextMenu(dismissLayer)
    fireEvent(dismissLayer, contextMenuEvent)

    expect(contextMenuEvent.defaultPrevented).toBe(true)
    expect(dismissLayer).toHaveStyle('pointer-events: none')
    expect(screen.queryByRole('menu', { name: '测试菜单' })).not.toBeInTheDocument()
  })

  it('dismisses when a rapid repeated secondary click lands on the opening menu surface', () => {
    const scheduler = new TestFrameScheduler()
    render(<MenuHarness scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const menu = screen.getByRole('menu', { name: '测试菜单' })
    fireEvent.pointerDown(menu, { button: 2, pointerId: 3 })
    expect(screen.queryByRole('menu', { name: '测试菜单' })).not.toBeInTheDocument()

    const contextMenuEvent = createEvent.contextMenu(menu)
    fireEvent(menu, contextMenuEvent)

    expect(contextMenuEvent.defaultPrevented).toBe(true)
    expect(screen.queryByRole('menu', { name: '测试菜单' })).not.toBeInTheDocument()
  })

  it('releases the secondary input shield when the native context menu never arrives', () => {
    const scheduler = new TestFrameScheduler()
    render(<MenuHarness scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const dismissLayer = screen.getByTestId('canvas-menu-dismiss-layer')
    fireEvent.pointerDown(dismissLayer, { button: 2, pointerId: 4 })
    expect(dismissLayer).toHaveStyle('pointer-events: auto')

    act(() => scheduler.step(500))

    expect(dismissLayer).toHaveStyle('pointer-events: none')
  })

  it('cancels live menu motion and clears the dismiss layer when the workspace reset key changes', () => {
    const scheduler = new TestFrameScheduler()
    const { rerender } = render(<MenuHarness resetKey="graph-1" scheduler={scheduler} />)

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    act(() => scheduler.step())
    expect(scheduler.pendingFrames).toBe(1)

    rerender(<MenuHarness resetKey="graph-2" scheduler={scheduler} />)

    expect(screen.queryByRole('menu', { name: '测试菜单' })).not.toBeInTheDocument()
    expect(screen.getByTestId('canvas-menu-dismiss-layer')).toHaveStyle('pointer-events: none')
    expect(scheduler.pendingFrames).toBe(0)
    expect(scheduler.pendingTimeouts).toBe(0)
  })
})

function readMenuScale(menu: HTMLElement): number {
  return Number(menu.style.getPropertyValue('--canvas-menu-scale'))
}

function readStyleRule(styles: string, selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('}')[0] ?? ''
}

function MenuHarness({
  resetKey,
  scheduler
}: {
  readonly resetKey?: string
  readonly scheduler: CanvasMenuMotionFrameScheduler
}) {
  const [open, setOpen] = useState(false)
  return (
    <CanvasMenuMotionProvider resetKey={resetKey} scheduler={scheduler}>
      <button type="button" onClick={() => setOpen(true)}>
        打开菜单
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        关闭菜单
      </button>
      <CanvasMenuSurface
        anchor={{ x: 24, y: 24 }}
        aria-label="测试菜单"
        menuId="test-menu"
        motionReady
        open={open}
        role="menu"
        onRequestClose={() => setOpen(false)}
      >
        <button role="menuitem" type="button">
          动作
        </button>
      </CanvasMenuSurface>
    </CanvasMenuMotionProvider>
  )
}

function TwoMenuHarness({ scheduler }: { readonly scheduler: CanvasMenuMotionFrameScheduler }) {
  const [firstOpen, setFirstOpen] = useState(false)
  const [secondOpen, setSecondOpen] = useState(false)
  return (
    <CanvasMenuMotionProvider scheduler={scheduler}>
      <button type="button" onClick={() => setFirstOpen(true)}>
        打开菜单一
      </button>
      <button type="button" onClick={() => setSecondOpen(true)}>
        打开菜单二
      </button>
      <CanvasMenuSurface
        anchor={{ x: 20, y: 20 }}
        aria-label="菜单一"
        menuId="first-menu"
        motionReady
        open={firstOpen}
        role="menu"
        onRequestClose={() => setFirstOpen(false)}
      />
      <CanvasMenuSurface
        anchor={{ x: 40, y: 20 }}
        aria-label="菜单二"
        menuId="second-menu"
        motionReady
        open={secondOpen}
        role="menu"
        onRequestClose={() => setSecondOpen(false)}
      />
    </CanvasMenuMotionProvider>
  )
}

class TestFrameScheduler implements CanvasMenuMotionFrameScheduler {
  private clock = 0
  private nextId = 1
  private frames = new Map<number, FrameRequestCallback>()
  private timeouts = new Map<number, { readonly callback: () => void; readonly deadline: number }>()

  cancelFrame = (id: number): void => void this.frames.delete(id)
  cancelTimeout = (id: number): void => void this.timeouts.delete(id)
  now = (): number => this.clock
  requestFrame = (callback: FrameRequestCallback): number => {
    const id = this.nextId++
    this.frames.set(id, callback)
    return id
  }
  requestTimeout = (callback: () => void, delay: number): number => {
    const id = this.nextId++
    this.timeouts.set(id, { callback, deadline: this.clock + delay })
    return id
  }

  get pendingFrames(): number {
    return this.frames.size
  }

  get pendingTimeouts(): number {
    return this.timeouts.size
  }

  step(milliseconds = 1_000 / 60): void {
    this.clock += milliseconds
    const callbacks = [...this.frames.values()]
    this.frames.clear()
    callbacks.forEach((callback) => callback(this.clock))
    this.runTimeouts()
  }

  finish(): void {
    for (let index = 0; index < 240 && this.frames.size > 0; index += 1) this.step()
  }

  private runTimeouts(): void {
    for (const [id, timeout] of this.timeouts) {
      if (timeout.deadline > this.clock) continue
      this.timeouts.delete(id)
      timeout.callback()
    }
  }
}
