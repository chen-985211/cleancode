import { TerminalRendererController } from '../../../src/presentation/app-shell/terminalRendererController'

describe('terminal renderer controller', () => {
  it('activates high-performance rendering and falls back after context loss', async () => {
    let loseContext: () => void = () => undefined
    const addon = {
      dispose: vi.fn(),
      setRasterScale: vi.fn(),
      onContextLoss: vi.fn((listener: () => void) => {
        loseContext = listener
        return { dispose: vi.fn() }
      })
    }
    const terminal = { loadAddon: vi.fn(), refresh: vi.fn(), rows: 24 }
    const states: string[] = []
    const controller = new TerminalRendererController({
      loadAddon: async () => addon,
      onStateChange: (state) => states.push(state),
      scheduleRefresh: (refresh) => refresh()
    })

    await controller.activate(terminal)
    loseContext()

    expect(terminal.loadAddon).toHaveBeenCalledWith(addon)
    expect(addon.dispose).toHaveBeenCalledTimes(1)
    expect(terminal.refresh).toHaveBeenCalledTimes(2)
    expect(terminal.refresh).toHaveBeenLastCalledWith(0, 23)
    expect(states).toEqual(['webgl', 'dom'])
    expect(controller.state).toBe('dom')
  })

  it('stays on the base renderer when loading fails and ignores a late addon after disposal', async () => {
    const failedStates: string[] = []
    const failed = new TerminalRendererController({
      loadAddon: async () => Promise.reject(new Error('unsupported')),
      onStateChange: (state) => failedStates.push(state)
    })

    await failed.activate({ loadAddon: vi.fn(), refresh: vi.fn(), rows: 24 })

    expect(failed.state).toBe('dom')
    expect(failedStates).toEqual([])

    let resolveAddon: (addon: {
      dispose(): void
      setRasterScale(scale: number): void
      onContextLoss(listener: () => void): { dispose(): void }
    }) => void = () => undefined
    const addon = { dispose: vi.fn(), setRasterScale: vi.fn(), onContextLoss: vi.fn() }
    const pending = new TerminalRendererController({
      loadAddon: () => new Promise((resolve) => (resolveAddon = resolve)),
      onStateChange: vi.fn()
    })
    const activation = pending.activate({ loadAddon: vi.fn(), refresh: vi.fn(), rows: 24 })
    pending.dispose()
    resolveAddon(addon)
    await activation

    expect(addon.dispose).toHaveBeenCalledTimes(1)
  })

  it('applies only the latest raster scale without resizing the terminal grid', async () => {
    const addon = {
      dispose: vi.fn(),
      onContextLoss: vi.fn(() => ({ dispose: vi.fn() })),
      setRasterScale: vi.fn()
    }
    const terminal = { loadAddon: vi.fn(), refresh: vi.fn(), rows: 24 }
    const controller = new TerminalRendererController({ loadAddon: async () => addon })

    controller.setRasterScale(1.25)
    controller.setRasterScale(1.5)
    await controller.activate(terminal)

    expect(addon.setRasterScale).toHaveBeenCalledOnce()
    expect(addon.setRasterScale).toHaveBeenCalledWith(1.5)
    expect(addon.setRasterScale.mock.invocationCallOrder[0]).toBeLessThan(
      terminal.loadAddon.mock.invocationCallOrder[0]!
    )

    controller.setRasterScale(1.5)
    controller.setRasterScale(1.75)

    expect(addon.setRasterScale).toHaveBeenCalledTimes(2)
    expect(addon.setRasterScale).toHaveBeenLastCalledWith(1.75)
    expect(terminal.refresh).not.toHaveBeenCalled()
  })

  it('keeps the previous scale retryable when a live renderer rejects an upgrade', async () => {
    const addon = {
      dispose: vi.fn(),
      onContextLoss: vi.fn(() => ({ dispose: vi.fn() })),
      setRasterScale: vi.fn()
    }
    const controller = new TerminalRendererController({ loadAddon: async () => addon })
    await controller.activate({ loadAddon: vi.fn(), refresh: vi.fn(), rows: 24 })
    addon.setRasterScale.mockClear()
    addon.setRasterScale.mockImplementationOnce(() => {
      throw new Error('texture allocation failed')
    })

    expect(() => controller.setRasterScale(1.75)).toThrow('texture allocation failed')
    controller.setRasterScale(1.75)

    expect(addon.setRasterScale).toHaveBeenCalledTimes(2)
  })
})
