import { fireEvent, render, screen } from '@testing-library/react'

import {
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBindings
} from '../../../src/presentation/app-shell/applicationShortcuts'
import {
  useApplicationShortcuts,
  type ApplicationShortcutActions
} from '../../../src/presentation/app-shell/useApplicationShortcuts'

describe('application shortcut dispatch', () => {
  it.each([
    ['openSettings', ',', false],
    ['toggleSidebar', 'b', false],
    ['addProject', 'o', false],
    ['createBranchWorkspace', 'n', false],
    ['previousWorkspace', 'ArrowUp', true],
    ['nextWorkspace', 'ArrowDown', true],
    ['createTerminal', 't', false],
    ['createAgent', 'a', true],
    ['groupTerminals', 'g', false],
    ['zoomCanvasIn', '=', false],
    ['zoomCanvasOut', '-', false],
    ['fitCanvas', '0', false],
    ['panCanvasLeft', 'ArrowLeft', false],
    ['panCanvasRight', 'ArrowRight', false],
    ['panCanvasUp', 'ArrowUp', false],
    ['panCanvasDown', 'ArrowDown', false],
    ['toggleMinimap', 'm', true]
  ] as const)(
    'dispatches the %s default shortcut and cancels the native event',
    (command, key, shiftKey) => {
      const actions = createActions()
      render(<ShortcutHarness actions={actions} />)

      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
        metaKey: true,
        shiftKey
      })
      document.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(actions[command].run).toHaveBeenCalledTimes(1)
      for (const [otherCommand, action] of Object.entries(actions)) {
        if (otherCommand !== command) {
          expect(action.run).not.toHaveBeenCalled()
        }
      }
    }
  )

  it.each([
    ['panCanvasLeft', 'ArrowLeft'],
    ['panCanvasRight', 'ArrowRight'],
    ['panCanvasUp', 'ArrowUp'],
    ['panCanvasDown', 'ArrowDown']
  ] as const)('keeps %s in one active gesture until keyup', (command, key) => {
    const actions = createActionsWithPanStops()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key, metaKey: true })
    fireEvent.keyDown(document, { key, metaKey: true, repeat: true })
    fireEvent.keyUp(document, { key, metaKey: true })

    expect(actions[command].run).toHaveBeenCalledTimes(1)
    expect(actions[command].stop).toHaveBeenCalledTimes(1)
  })

  it('ignores keyboard auto-repeat for non-pan actions', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'a', metaKey: true, repeat: true, shiftKey: true })

    expect(actions.createAgent.run).not.toHaveBeenCalled()
  })

  it('dispatches keyboard auto-repeat through a customized pan binding', () => {
    const actions = createActionsWithPanStops()
    const bindings: ApplicationShortcutBindings = {
      ...defaultApplicationShortcutBindings,
      panCanvasLeft: { alt: false, key: 'H', primary: true, shift: false }
    }
    render(<ShortcutHarness actions={actions} bindings={bindings} />)

    fireEvent.keyDown(document, { key: 'h', metaKey: true })
    fireEvent.keyDown(document, { key: 'h', metaKey: true, repeat: true })
    fireEvent.keyUp(document, { key: 'h', metaKey: true })

    expect(actions.panCanvasLeft.run).toHaveBeenCalledTimes(1)
    expect(actions.panCanvasLeft.stop).toHaveBeenCalledTimes(1)
  })

  it('stops an active pan when the primary modifier is released', () => {
    const actions = createActionsWithPanStops()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'ArrowLeft', metaKey: true })
    fireEvent.keyUp(document, { key: 'Meta' })

    expect(actions.panCanvasLeft.stop).toHaveBeenCalledTimes(1)
  })

  it('stops active pans when the window loses focus or the shortcut hook unmounts', () => {
    const blurActions = createActionsWithPanStops()
    const { unmount } = render(<ShortcutHarness actions={blurActions} />)

    fireEvent.keyDown(document, { key: 'ArrowLeft', metaKey: true })
    fireEvent.blur(window)

    expect(blurActions.panCanvasLeft.stop).toHaveBeenCalledTimes(1)
    unmount()

    const unmountActions = createActionsWithPanStops()
    const mounted = render(<ShortcutHarness actions={unmountActions} />)
    fireEvent.keyDown(document, { key: 'ArrowRight', metaKey: true })

    mounted.unmount()

    expect(unmountActions.panCanvasRight.stop).toHaveBeenCalledTimes(1)
  })

  it('stops active pans when the page becomes hidden', () => {
    const actions = createActionsWithPanStops()
    render(<ShortcutHarness actions={actions} />)
    fireEvent.keyDown(document, { key: 'ArrowUp', metaKey: true })

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      expect(actions.panCanvasUp.stop).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    }
  })

  it('keeps an active pan alive when the action catalog rerenders', () => {
    const actions = createActionsWithPanStops()
    const view = render(<ShortcutHarness actions={actions} />)
    fireEvent.keyDown(document, { key: 'ArrowLeft', metaKey: true })

    view.rerender(<ShortcutHarness actions={{ ...actions }} />)

    expect(actions.panCanvasLeft.stop).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'ArrowLeft', metaKey: true, repeat: true })
    fireEvent.keyUp(document, { key: 'ArrowLeft', metaKey: true })
    expect(actions.panCanvasLeft.run).toHaveBeenCalledTimes(1)
    expect(actions.panCanvasLeft.stop).toHaveBeenCalledTimes(1)
  })

  it('protects xterm from repeated pan shortcuts', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(screen.getByLabelText('快捷键测试终端'), {
      key: 'ArrowLeft',
      metaKey: true,
      repeat: true
    })

    expect(actions.panCanvasLeft.run).not.toHaveBeenCalled()
  })

  it('does not dispatch disabled actions or partial modifier matches', () => {
    const actions = createActions({ groupTerminals: false })
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'g', metaKey: true })
    fireEvent.keyDown(document, { key: 't', metaKey: true, shiftKey: true })

    expect(actions.groupTerminals.run).not.toHaveBeenCalled()
    expect(actions.createTerminal.run).not.toHaveBeenCalled()
  })

  it('does not create an Agent without the Shift modifier', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'a', metaKey: true })

    expect(actions.createAgent.run).not.toHaveBeenCalled()
  })

  it.each([
    ['text input', '快捷键测试输入'],
    ['content editable region', '快捷键测试编辑区'],
    ['xterm surface', '快捷键测试终端']
  ])('protects the %s from application shortcuts', (_name, label) => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(screen.getByLabelText(label), {
      key: 't',
      metaKey: true
    })

    expect(actions.createTerminal.run).not.toHaveBeenCalled()
  })

  it('suspends global actions while a modal dialog is open', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} showDialog />)

    fireEvent.keyDown(document, { key: 't', metaKey: true })
    fireEvent.keyDown(document, { key: ',', metaKey: true })

    expect(actions.createTerminal.run).not.toHaveBeenCalled()
    expect(actions.openSettings.run).not.toHaveBeenCalled()
  })
})

function ShortcutHarness({
  actions,
  bindings = defaultApplicationShortcutBindings,
  showDialog = false
}: {
  readonly actions: ApplicationShortcutActions
  readonly bindings?: ApplicationShortcutBindings
  readonly showDialog?: boolean
}) {
  useApplicationShortcuts({
    actions,
    bindings,
    platform: 'mac'
  })

  return (
    <>
      <input aria-label="快捷键测试输入" />
      <div aria-label="快捷键测试编辑区" contentEditable suppressContentEditableWarning>
        编辑
      </div>
      <div className="xterm" aria-label="快捷键测试终端" tabIndex={0} />
      {showDialog ? <div role="dialog" aria-modal="true" aria-label="测试对话框" /> : null}
    </>
  )
}

function createActions(
  enabled: Partial<Record<keyof ApplicationShortcutActions, boolean>> = {}
): ApplicationShortcutActions {
  return {
    openSettings: { enabled: enabled.openSettings ?? true, run: vi.fn() },
    toggleSidebar: { enabled: enabled.toggleSidebar ?? true, run: vi.fn() },
    addProject: { enabled: enabled.addProject ?? true, run: vi.fn() },
    createBranchWorkspace: {
      enabled: enabled.createBranchWorkspace ?? true,
      run: vi.fn()
    },
    previousWorkspace: { enabled: enabled.previousWorkspace ?? true, run: vi.fn() },
    nextWorkspace: { enabled: enabled.nextWorkspace ?? true, run: vi.fn() },
    createTerminal: { enabled: enabled.createTerminal ?? true, run: vi.fn() },
    createAgent: { enabled: enabled.createAgent ?? true, run: vi.fn() },
    groupTerminals: { enabled: enabled.groupTerminals ?? true, run: vi.fn() },
    zoomCanvasIn: { enabled: enabled.zoomCanvasIn ?? true, run: vi.fn() },
    zoomCanvasOut: { enabled: enabled.zoomCanvasOut ?? true, run: vi.fn() },
    fitCanvas: { enabled: enabled.fitCanvas ?? true, run: vi.fn() },
    panCanvasLeft: { enabled: enabled.panCanvasLeft ?? true, run: vi.fn() },
    panCanvasRight: { enabled: enabled.panCanvasRight ?? true, run: vi.fn() },
    panCanvasUp: { enabled: enabled.panCanvasUp ?? true, run: vi.fn() },
    panCanvasDown: { enabled: enabled.panCanvasDown ?? true, run: vi.fn() },
    toggleMinimap: { enabled: enabled.toggleMinimap ?? true, run: vi.fn() }
  }
}

type ActionWithStop = ApplicationShortcutActions['panCanvasLeft'] & {
  readonly stop: ReturnType<typeof vi.fn>
}

type ActionsWithPanStops = ApplicationShortcutActions & {
  readonly panCanvasLeft: ActionWithStop
  readonly panCanvasRight: ActionWithStop
  readonly panCanvasUp: ActionWithStop
  readonly panCanvasDown: ActionWithStop
}

function createActionsWithPanStops(): ActionsWithPanStops {
  const actions = createActions()
  return {
    ...actions,
    panCanvasLeft: { ...actions.panCanvasLeft, stop: vi.fn() },
    panCanvasRight: { ...actions.panCanvasRight, stop: vi.fn() },
    panCanvasUp: { ...actions.panCanvasUp, stop: vi.fn() },
    panCanvasDown: { ...actions.panCanvasDown, stop: vi.fn() }
  } as ActionsWithPanStops
}
