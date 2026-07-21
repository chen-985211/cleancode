import { TerminalRendererController } from '../../../src/presentation/app-shell/terminalRendererController'

describe('terminal renderer controller', () => {
  it('activates high-performance rendering and falls back after context loss', async () => {
    let loseContext: () => void = () => undefined
    const addon = {
      dispose: vi.fn(),
      onContextLoss: vi.fn((listener: () => void) => {
        loseContext = listener
        return { dispose: vi.fn() }
      })
    }
    const terminal = { loadAddon: vi.fn(), refresh: vi.fn(), rows: 24 }
    const states: string[] = []
    const controller = new TerminalRendererController({
      loadAddon: async () => addon,
      onStateChange: (state) => states.push(state)
    })

    await controller.activate(terminal)
    loseContext()

    expect(terminal.loadAddon).toHaveBeenCalledWith(addon)
    expect(addon.dispose).toHaveBeenCalledTimes(1)
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23)
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
      onContextLoss(listener: () => void): { dispose(): void }
    }) => void = () => undefined
    const addon = { dispose: vi.fn(), onContextLoss: vi.fn() }
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
})
