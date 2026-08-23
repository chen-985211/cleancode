import { EventEmitter } from 'node:events'

import type { MainWindowStateStore } from '../../../src/platform/electron-main/FileSystemMainWindowStateStore'
import {
  bindMainWindowStatePersistence,
  mainWindowStateSaveDelayMs
} from '../../../src/platform/electron-main/mainWindowStateLifecycle'
import type {
  MainWindowBounds,
  MainWindowStateSnapshot
} from '../../../src/platform/electron-main/mainWindowStatePolicy'

describe('platform main window state lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces move and resize events and saves the latest normal bounds', () => {
    const target = new FakeWindow()
    const store = createStore()
    const binding = bindMainWindowStatePersistence({
      initialState: snapshot(target.normalBounds, 'normal'),
      persistDisplayMode: true,
      store,
      target
    })

    target.normalBounds = { x: 160, y: 100, width: 1_260, height: 820 }
    target.emit('move')
    target.normalBounds = { x: 180, y: 120, width: 1_360, height: 860 }
    target.emit('resize')

    vi.advanceTimersByTime(mainWindowStateSaveDelayMs - 1)
    expect(store.save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(store.save).toHaveBeenCalledTimes(1)
    expect(store.save).toHaveBeenCalledWith(snapshot(target.normalBounds, 'normal'))

    binding.dispose()
  })

  it('tracks maximized and fullscreen modes without replacing the normal bounds', () => {
    const target = new FakeWindow()
    const store = createStore()
    const binding = bindMainWindowStatePersistence({
      initialState: snapshot(target.normalBounds, 'normal'),
      persistDisplayMode: true,
      store,
      target
    })
    target.normalBounds = { x: 220, y: 140, width: 1_420, height: 900 }

    target.isMaximizedValue = true
    target.emit('maximize')
    vi.runOnlyPendingTimers()
    expect(store.save).toHaveBeenLastCalledWith(snapshot(target.normalBounds, 'maximized'))

    target.isFullScreenValue = true
    target.emit('enter-full-screen')
    vi.runOnlyPendingTimers()
    expect(store.save).toHaveBeenLastCalledWith(snapshot(target.normalBounds, 'fullscreen'))

    target.isFullScreenValue = false
    target.emit('leave-full-screen')
    vi.runOnlyPendingTimers()
    expect(store.save).toHaveBeenLastCalledWith(snapshot(target.normalBounds, 'maximized'))

    target.isMaximizedValue = false
    target.emit('unmaximize')
    vi.runOnlyPendingTimers()
    expect(store.save).toHaveBeenLastCalledWith(snapshot(target.normalBounds, 'normal'))

    binding.dispose()
  })

  it('keeps the last non-minimized mode and flushes immediately when closing', () => {
    const target = new FakeWindow()
    const store = createStore()
    bindMainWindowStatePersistence({
      initialState: snapshot(target.normalBounds, 'maximized'),
      persistDisplayMode: true,
      store,
      target
    })
    target.normalBounds = { x: 240, y: 160, width: 1_440, height: 920 }
    target.isMinimizedValue = true

    target.emit('minimize')
    target.emit('close')

    expect(store.save).toHaveBeenCalledTimes(1)
    expect(store.save).toHaveBeenCalledWith(snapshot(target.normalBounds, 'maximized'))

    target.emit('closed')
    target.normalBounds = { x: 300, y: 200, width: 1_500, height: 960 }
    target.emit('resize')
    vi.runOnlyPendingTimers()
    expect(store.save).toHaveBeenCalledTimes(1)
    expect(target.listenerCount('resize')).toBe(0)
    expect(target.listenerCount('enter-full-screen')).toBe(0)
  })

  it('flushes the current normal bounds when native normal bounds lag behind', () => {
    const target = new FakeWindow()
    const store = createStore()
    const binding = bindMainWindowStatePersistence({
      initialState: snapshot(target.normalBounds, 'normal'),
      persistDisplayMode: true,
      store,
      target
    })
    target.currentBounds = { x: 120, y: 80, width: 1_100, height: 700 }

    target.emit('close')

    expect(store.save).toHaveBeenCalledWith(snapshot(target.currentBounds, 'normal'))
    binding.dispose()
  })

  it('records an unmaximize transition before a rapid minimize and close', () => {
    const target = new FakeWindow()
    const store = createStore()
    const binding = bindMainWindowStatePersistence({
      initialState: snapshot(target.normalBounds, 'maximized'),
      persistDisplayMode: true,
      store,
      target
    })

    target.isMaximizedValue = false
    target.emit('unmaximize')
    target.isMinimizedValue = true
    target.emit('minimize')
    target.emit('close')

    expect(store.save).toHaveBeenCalledTimes(1)
    expect(store.save).toHaveBeenCalledWith(snapshot(target.normalBounds, 'normal'))
    binding.dispose()
  })

  it('persists only normal mode for the isolated offscreen E2E window', () => {
    const target = new FakeWindow()
    const store = createStore()
    const binding = bindMainWindowStatePersistence({
      initialState: snapshot(target.normalBounds, 'normal'),
      persistDisplayMode: false,
      store,
      target
    })
    target.normalBounds = { x: -50_000, y: -50_000, width: 1_360, height: 860 }
    target.isFullScreenValue = true

    target.emit('enter-full-screen')
    vi.runOnlyPendingTimers()

    expect(store.save).toHaveBeenCalledWith(snapshot(target.normalBounds, 'normal'))
    binding.dispose()
  })

  it('allows crash recovery to flush pending state before recreating the window', () => {
    const target = new FakeWindow()
    const store = createStore()
    const binding = bindMainWindowStatePersistence({
      initialState: snapshot(target.normalBounds, 'normal'),
      persistDisplayMode: true,
      store,
      target
    })
    target.normalBounds = { x: 260, y: 180, width: 1_400, height: 880 }
    target.emit('resize')

    binding.flush()
    vi.runOnlyPendingTimers()

    expect(store.save).toHaveBeenCalledTimes(1)
    expect(store.save).toHaveBeenCalledWith(snapshot(target.normalBounds, 'normal'))
    binding.dispose()
  })
})

class FakeWindow extends EventEmitter {
  currentBounds: MainWindowBounds | null = null
  normalBounds: MainWindowBounds = { x: 120, y: 80, width: 1_200, height: 800 }
  isFullScreenValue = false
  isMaximizedValue = false
  isMinimizedValue = false

  getNormalBounds(): MainWindowBounds {
    return this.normalBounds
  }

  getBounds(): MainWindowBounds {
    return this.currentBounds ?? this.normalBounds
  }

  isFullScreen(): boolean {
    return this.isFullScreenValue
  }

  isMaximized(): boolean {
    return this.isMaximizedValue
  }

  isMinimized(): boolean {
    return this.isMinimizedValue
  }
}

function createStore() {
  return {
    load: vi.fn(() => null),
    save: vi.fn<(state: MainWindowStateSnapshot) => void>()
  } satisfies MainWindowStateStore
}

function snapshot(
  normalBounds: MainWindowBounds,
  displayMode: MainWindowStateSnapshot['displayMode']
): MainWindowStateSnapshot {
  return { version: 1, displayMode, normalBounds }
}
