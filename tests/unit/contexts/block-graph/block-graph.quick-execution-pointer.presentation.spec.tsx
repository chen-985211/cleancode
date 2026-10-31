import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { QuickExecutionBar } from '../../../../src/contexts/block-graph/presentation/components/QuickExecutionBar'

describe('quick execution pointer sorting', () => {
  it.each(['outside', 'source'])(
    'returns from a hovered grab to the resting glyph without a final jump (%s)',
    (release) => {
      mount()
      const source = slot(2)
      const glyph = source.querySelector<HTMLElement>('.quick-execution__glyph')!
      Object.defineProperties(source, {
        clientLeft: { configurable: true, value: 1 },
        clientTop: { configurable: true, value: 1 }
      })
      Object.defineProperties(glyph, {
        offsetWidth: { configurable: true, value: 18 },
        offsetHeight: { configurable: true, value: 18 },
        offsetLeft: { configurable: true, value: 14 },
        offsetTop: { configurable: true, value: 2 },
        offsetParent: { configurable: true, value: source }
      })
      // Hover raises/scales the glyph; resting layout remains centered at (164, 212).
      Object.defineProperty(glyph, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(152.75, 194.5, 22.5, 22.5)
      })
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerMove(window, pointer(500, 300))
      fireEvent.pointerUp(window, release === 'source' ? pointer(155, 210) : pointer(500, 300))
      expect(document.querySelector('[data-quick-execution-return-animation]')).toHaveStyle({
        left: '45px',
        top: '0px'
      })
    }
  )
  it.each(['pointer', 'focus'])(
    'resumes hover only after fresh %s input following a return',
    async (input) => {
      mount()
      const source = slot(2)
      const root = document.querySelector('[data-quick-execution-bar]')!
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerMove(window, pointer(500, 180))
      fireEvent.pointerUp(window, pointer(500, 180))
      expect(root).toHaveAttribute('data-quick-execution-quiet-hover')
      await waitFor(() =>
        expect(document.querySelector('[data-quick-execution-return-animation]')).toBeNull()
      )
      expect(root).toHaveAttribute('data-quick-execution-quiet-hover')
      if (input === 'pointer') fireEvent.pointerMove(source, pointer(155, 210))
      else fireEvent.focus(source.querySelector('button')!)
      expect(root).not.toHaveAttribute('data-quick-execution-quiet-hover')
    }
  )
  it.each(
    [false, true].flatMap((arranging) =>
      [
        { release: 'source', x: 155, y: 210, target: null },
        { release: 'outside', x: 500, y: 100, target: null },
        { release: 'swap', x: 245, y: 210, target: 4 }
      ].map((scenario) => ({ ...scenario, arranging }))
    )
  )(
    'restores keyboard tooltips after a $release release (arranging: $arranging)',
    async ({ arranging, x, y, target }) => {
      const { onFocus, onReorder } = mount()
      if (arranging) openArrangement()
      const source = slot(2)
      const button = source.querySelector('button')!
      fireEvent.pointerDown(button, pointer(155, 210))
      act(() => button.focus())
      fireEvent.pointerMove(window, pointer(175, 190))
      // Pointer capture delivers the release to the source even outside its bounds.
      fireEvent.pointerUp(source, pointer(x, y))
      fireEvent.click(button, { detail: 1 })
      expect(onFocus).not.toHaveBeenCalled()
      if (target === null) expect(onReorder).not.toHaveBeenCalled()
      else expect(onReorder).toHaveBeenCalledExactlyOnceWith(2, target)
      await waitFor(() =>
        expect(document.querySelector('[data-quick-execution-return-animation]')).toBeNull()
      )

      act(() => button.blur())
      fireEvent.keyDown(document, { key: 'Tab' })
      act(() => button.focus())
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        '已绑定终端「Worker」。按 ⌘2 执行此快捷位；单击定位视图，双击直接运行。'
      )
      expect(onFocus).not.toHaveBeenCalled()
    }
  )
  it('keeps clicks below the drag threshold and follows the original grab point directly', () => {
    const { onFocus, onReorder } = mount()
    const source = slot(2)
    fireEvent.pointerDown(source, pointer(155, 210))
    fireEvent.pointerMove(window, pointer(157, 210))
    expect(document.querySelector('[data-quick-execution-drag-proxy]')).toBeNull()
    fireEvent.pointerUp(window, pointer(157, 210))
    fireEvent.click(source.querySelector('button')!)
    expect(onFocus).toHaveBeenCalledOnce()

    fireEvent.pointerDown(source, pointer(155, 210))
    fireEvent.pointerMove(window, pointer(175, 190))
    const proxy = document.querySelector<HTMLElement>('[data-quick-execution-drag-proxy]')!
    expect(proxy).toHaveTextContent('Worker')
    expect(proxy.querySelector('kbd')).toBeNull()
    expect(proxy).toHaveStyle({ width: '38px', height: '24px' })
    expect(proxy).toHaveStyle({ transform: 'translate3d(60px, -20px, 0)' })
    fireEvent.pointerMove(window, pointer(245, 210))
    expect(proxy).toHaveStyle({ transform: 'translate3d(130px, 0px, 0)' })
    expect(slot(4)).toHaveClass('quick-execution__slot--reorder-target')
    expect(slot(4).querySelector('[data-quick-execution-swap-preview]')).toHaveTextContent('Worker')
    expect(onReorder).not.toHaveBeenCalled()
  })

  it.each([1, 4])(
    'lands at fixed position %s immediately while one swap is pending',
    async (target) => {
      let finish!: () => void
      const pending = new Promise<void>((resolve) => {
        finish = resolve
      })
      const onReorder = vi.fn(() => pending)
      const { onFocus } = mount(onReorder)
      if (target === 1) openArrangement()
      fireEvent.pointerDown(slot(2), pointer(155, 210))
      fireEvent.pointerMove(window, pointer(175, 210))
      const x = 100 + (target - 1) * 40 + 15
      fireEvent.pointerMove(window, pointer(x, 210))
      fireEvent.pointerUp(window, pointer(x, 210))
      expect(onReorder).toHaveBeenCalledExactlyOnceWith(2, target)
      expect(slot(target)).toHaveTextContent('Worker')
      if (target === 4) expect(slot(2)).toHaveTextContent('Server')
      fireEvent.click(slot(target).querySelector('button')!)
      expect(onFocus).not.toHaveBeenCalled()
      await act(async () => finish())
      // No authoritative graph update means the save failed/was refused; restore it.
      expect(slot(2)).toHaveTextContent('Worker')
      expect(slot(4)).toHaveTextContent('Server')
    }
  )

  it.each([false, true])(
    'uses a full row only in the arrangement panel (arranging: %s)',
    (arranging) => {
      mount()
      if (arranging) openArrangement()
      const source = slot(2)
      Object.defineProperty(source, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(140, 200, 86, 66)
      })
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerMove(window, pointer(175, 210))
      expect(document.querySelector('[data-quick-execution-drag-proxy]')).toHaveStyle({
        width: arranging ? '86px' : '38px',
        height: arranging ? '66px' : '24px'
      })
      const proxy = document.querySelector<HTMLElement>('[data-quick-execution-drag-proxy]')!
      if (arranging) {
        expect(within(proxy).getByText('终端')).toBeInTheDocument()
        expect(proxy.querySelector('kbd')).toHaveTextContent('2')
      } else expect(proxy.querySelector('kbd')).toBeNull()
    }
  )

  it.each([
    { target: 2, x: 500, y: 100, top: '-40px' },
    { target: 4, x: 280, y: 260, top: '48px' },
    { target: 1, x: 120, y: 130, top: '-84px' }
  ])('lands the whole arranged row at fixed position $target', ({ target, x, y, top }) => {
    const view = mount()
    openArrangement()
    for (const [number, rowY] of [
      [1, 116],
      [2, 160],
      [4, 248]
    ] as const) {
      Object.defineProperty(slot(number), 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(100, rowY, 308, 42)
      })
    }
    fireEvent.pointerDown(slot(2), pointer(170, 180))
    fireEvent.pointerMove(window, pointer(x, y))
    fireEvent.pointerUp(window, pointer(x, y))
    const returning = document.querySelector('[data-quick-execution-return-animation]')!
    expect(returning).toHaveStyle({ left: '0px', top, width: '308px', height: '42px' })
    expect(returning.querySelector('kbd')).toHaveTextContent(String(target))
    if (target === 2) expect(view.onReorder).not.toHaveBeenCalled()
    else expect(view.onReorder).toHaveBeenCalledExactlyOnceWith(2, target)
    expect(view.onFocus).not.toHaveBeenCalled()
  })

  it('lands at the target glyph layout position while its binding is displaced by the preview', () => {
    mount()
    const destination = slot(4)
    const binding = destination.querySelector<HTMLElement>('.quick-execution__binding')!
    const glyph = destination.querySelector<HTMLElement>('.quick-execution__glyph')!
    Object.defineProperties(destination, {
      clientLeft: { configurable: true, value: 1 },
      clientTop: { configurable: true, value: 1 }
    })
    Object.defineProperties(binding, {
      offsetLeft: { configurable: true, value: 15 },
      offsetTop: { configurable: true, value: 2 },
      offsetParent: { configurable: true, value: destination }
    })
    Object.defineProperties(glyph, {
      offsetWidth: { configurable: true, value: 18 },
      offsetHeight: { configurable: true, value: 18 },
      offsetLeft: { configurable: true, value: 0 },
      offsetTop: { configurable: true, value: 0 },
      offsetParent: { configurable: true, value: binding }
    })
    fireEvent.pointerDown(slot(2), pointer(155, 210))
    fireEvent.pointerMove(window, pointer(245, 210))
    expect(binding.style.transform).not.toBe('')
    fireEvent.pointerUp(window, pointer(245, 210))
    expect(document.querySelector('[data-quick-execution-return-animation]')).toHaveStyle({
      left: '126px',
      top: '0px'
    })
  })

  it('only accepts arrangement targets while dragging inside the five-slot panel', () => {
    const view = mount()
    openArrangement()
    const source = slot(2)
    const compactTarget = document.querySelector<HTMLElement>(
      '[data-quick-execution-slots="dock"] [data-quick-execution-slot="4"]'
    )!
    vi.spyOn(compactTarget, 'getBoundingClientRect').mockReturnValue(new DOMRect(400, 300, 38, 24))
    fireEvent.pointerDown(source, pointer(155, 210))
    fireEvent.pointerMove(window, pointer(415, 310))
    fireEvent.pointerUp(window, pointer(415, 310))
    expect(view.onReorder).not.toHaveBeenCalled()
  })

  it('cancels a drag with Escape before dismissing the arrangement panel', () => {
    const view = mount()
    openArrangement()
    fireEvent.pointerDown(slot(2), pointer(155, 210))
    fireEvent.pointerMove(window, pointer(245, 210))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '整理快捷位' })).toBeInTheDocument()
    expect(document.querySelector('[data-quick-execution-drag-proxy]')).toBeNull()
    expect(view.onReorder).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '整理快捷位' })).not.toBeInTheDocument()
  })

  it('adopts the saved graph without applying the visual swap twice', async () => {
    let finish!: () => void
    const onReorder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const view = mount(onReorder)
    fireEvent.pointerDown(slot(2), pointer(155, 210))
    fireEvent.pointerMove(window, pointer(245, 210))
    fireEvent.pointerUp(window, pointer(245, 210))
    const saved = {
      ...view.graph,
      quickExecutionSlots: view.graph.quickExecutionSlots!.map((entry) => ({
        ...entry,
        target:
          view.graph.quickExecutionSlots![
            entry.number === 2 ? 3 : entry.number === 4 ? 1 : entry.number - 1
          ]!.target
      }))
    }
    view.rerender(<QuickExecutionBar {...view.props} graph={saved} />)
    expect(slot(4)).toHaveTextContent('Worker')
    expect(slot(2)).toHaveTextContent('Server')
    await act(async () => finish())
    expect(slot(4)).toHaveTextContent('Worker')
    expect(slot(2)).toHaveTextContent('Server')
  })

  it.each(['escape', 'cancel', 'capture', 'blur', 'outside', 'hidden', 'workspace'])(
    'cancels %s without swapping, clearing or locating anything',
    (reason) => {
      const view = mount()
      const source = slot(2)
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerMove(window, pointer(245, 210))
      expect(document.querySelector('[data-quick-execution-drag-proxy]')).toBeInTheDocument()
      if (reason === 'escape') fireEvent.keyDown(window, { key: 'Escape' })
      if (reason === 'cancel') fireEvent.pointerCancel(window, pointer(245, 210))
      if (reason === 'capture') fireEvent.lostPointerCapture(source, pointer(245, 210))
      if (reason === 'blur') fireEvent.blur(window)
      if (reason === 'outside') fireEvent.pointerUp(window, pointer(500, 100))
      if (reason === 'hidden') view.rerender(<QuickExecutionBar {...view.props} open={false} />)
      if (reason === 'workspace')
        view.rerender(
          <QuickExecutionBar {...view.props} graph={{ ...view.graph, workspaceId: 'other' }} />
        )
      fireEvent.pointerUp(window, pointer(245, 210))
      expect(document.querySelector('[data-quick-execution-drag-proxy]')).toBeNull()
      expect(view.onReorder).not.toHaveBeenCalled()
      expect(view.props.onClear).not.toHaveBeenCalled()
      expect(view.onFocus).not.toHaveBeenCalled()
    }
  )

  it.each(['release', 'cancel'])(
    'does not execute when a double-click gesture becomes a drag (%s)',
    (finish) => {
      const view = mount()
      const source = slot(2)
      const button = source.querySelector('button')!
      fireEvent.click(button, { detail: 1 })
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerMove(window, pointer(170, 210))
      fireEvent.click(button, { detail: 2 })
      expect(view.props.onExecute).not.toHaveBeenCalled()
      if (finish === 'cancel') fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.pointerUp(window, pointer(170, 210))
      fireEvent.click(button, { detail: 2 })
      fireEvent.doubleClick(button, { detail: 2 })
      expect(view.onFocus).toHaveBeenCalledOnce()
      expect(view.props.onExecute).not.toHaveBeenCalled()

      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerUp(source, pointer(155, 210))
      fireEvent.click(button, { detail: 1 })
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerUp(source, pointer(155, 210))
      fireEvent.click(button, { detail: 2 })
      fireEvent.doubleClick(button, { detail: 2 })
      expect(view.props.onExecute).toHaveBeenCalledExactlyOnceWith({
        type: 'terminal',
        terminalBlockId: 'Worker'
      })
    }
  )

  it('keeps a cancelled gesture from clicking when the mouse is released later', async () => {
    vi.useFakeTimers()
    try {
      const view = mount()
      const source = slot(2)
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerMove(window, pointer(170, 210))
      fireEvent.keyDown(window, { key: 'Escape' })
      await act(async () => {
        await vi.runAllTimersAsync()
      })
      fireEvent.click(source.querySelector('button')!, { detail: 0 })
      expect(view.onFocus).toHaveBeenCalledOnce()
      fireEvent.pointerUp(source, pointer(155, 210))
      fireEvent.click(source.querySelector('button')!, { detail: 1 })
      expect(view.onFocus).toHaveBeenCalledOnce()
      fireEvent.pointerDown(source, pointer(155, 210))
      fireEvent.pointerUp(source, pointer(155, 210))
      fireEvent.click(source.querySelector('button')!, { detail: 1 })
      expect(view.onFocus).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not tremble while moving horizontally within the Dock under the clear target', () => {
    mount()
    fireEvent.pointerDown(slot(2), pointer(155, 210))
    fireEvent.pointerMove(window, pointer(275, 210))
    expect(document.querySelector('[data-quick-execution-drag-proxy]')).not.toHaveClass(
      'quick-execution__drag-proxy--near-black-hole'
    )
  })

  it.each([
    { y: 270, swaps: true },
    { y: 300, swaps: false }
  ])('only targets the visible portion of a scrolled row at y=$y', ({ y, swaps }) => {
    const { onReorder } = mount()
    openArrangement()
    const container = slot(2).closest<HTMLElement>('[data-quick-execution-slots]')!
    Object.defineProperty(container, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(100, 200, 300, 88)
    })
    Object.defineProperty(slot(4), 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(100, 260, 300, 42)
    })
    fireEvent.pointerDown(slot(2), pointer(155, 210))
    fireEvent.pointerMove(window, pointer(115, y))
    expect(slot(4).classList.contains('quick-execution__slot--reorder-target')).toBe(swaps)
    fireEvent.pointerUp(window, pointer(115, y))
    if (swaps) expect(onReorder).toHaveBeenCalledExactlyOnceWith(2, 4)
    else expect(onReorder).not.toHaveBeenCalled()
  })
})

function pointer(clientX: number, clientY: number) {
  return { button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', clientX, clientY }
}

function slot(number: number) {
  const surface = screen.queryByRole('dialog', { name: '整理快捷位' }) ?? document
  return surface.querySelector<HTMLElement>(`[data-quick-execution-slot="${number}"]`)!
}

function openArrangement() {
  fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '整理快捷位' }))
}

function mount(onReorder = vi.fn<() => Promise<void> | void>()) {
  const graph: BlockGraphSnapshot = {
    id: 'graph',
    projectId: 'project',
    workspaceId: 'workspace',
    viewport: { x: 0, y: 0, zoom: 1 },
    connections: [],
    terminalGroups: [],
    blocks: ['Worker', 'Server'].map((name) => ({
      id: name,
      name,
      type: 'terminal',
      description: '',
      launchCommand: '',
      position: { x: 0, y: 0 },
      size: { width: 720, height: 460 },
      executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
    })),
    quickExecutionSlots: ([1, 2, 3, 4, 5] as const).map((number) => ({
      number,
      target:
        number === 2 || number === 4
          ? { type: 'terminal', terminalBlockId: number === 2 ? 'Worker' : 'Server' }
          : null
    }))
  }
  const props = {
    graph,
    onAdd: vi.fn(),
    onClear: vi.fn(),
    onFocus: vi.fn(),
    onExecute: vi.fn(),
    onReorder
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const number = Number(this.dataset.quickExecutionSlot)
    if (number) return new DOMRect(100 + (number - 1) * 40, 200, 38, 24)
    if (this.hasAttribute('data-quick-execution-bar')) return new DOMRect(100, 200, 224, 24)
    if (this.hasAttribute('data-quick-execution-trash')) return new DOMRect(212, 106, 112, 58)
    return new DOMRect()
  })
  return {
    ...render(<QuickExecutionBar {...props} />),
    props,
    graph,
    onFocus: props.onFocus,
    onReorder
  }
}
