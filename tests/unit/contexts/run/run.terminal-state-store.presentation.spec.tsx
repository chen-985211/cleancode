import { act, render } from '@testing-library/react'

import {
  createTerminalStateStore,
  useTerminalState
} from '../../../../src/contexts/run/presentation/view-models/terminalStateStore'
import type { TerminalViewState } from '../../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'

describe('Terminal state store', () => {
  it('notifies only selectors whose terminal runtime state changed', () => {
    const first = createTerminalState('first')
    const second = createTerminalState('second')
    const store = createTerminalStateStore({ first, second })
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    const releaseFirst = store.subscribe('first', firstListener)
    const releaseSecond = store.subscribe('second', secondListener)

    const nextFirst = { ...first, status: 'running' as const }
    store.replaceStates({ first: nextFirst, second })

    expect(store.getState('first')).toBe(nextFirst)
    expect(store.getState('second')).toBe(second)
    expect(firstListener).toHaveBeenCalledOnce()
    expect(secondListener).not.toHaveBeenCalled()

    store.replaceStates({ first: nextFirst, second })
    expect(firstListener).toHaveBeenCalledOnce()
    expect(secondListener).not.toHaveBeenCalled()

    releaseFirst()
    releaseSecond()
    expect(store.getDiagnostics()).toEqual({ listenerCount: 0, stateCount: 2 })
  })

  it('rerenders only the affected leaf in a dense terminal matrix', () => {
    const ids = Array.from({ length: 240 }, (_, index) => `terminal-${index + 1}`)
    const states = Object.fromEntries(ids.map((id) => [id, createTerminalState(id)]))
    const store = createTerminalStateStore(states)
    const renderCounts = new Map<string, number>()

    const view = render(
      <>
        {ids.map((id) => (
          <TerminalStateProbe key={id} id={id} renderCounts={renderCounts} store={store} />
        ))}
      </>
    )

    renderCounts.clear()
    const changedId = 'terminal-137'
    act(() => {
      store.replaceStates({
        ...states,
        [changedId]: { ...states[changedId]!, status: 'running' }
      })
    })

    expect(renderCounts).toEqual(new Map([[changedId, 1]]))
    expect(store.getDiagnostics()).toEqual({ listenerCount: ids.length, stateCount: ids.length })

    view.unmount()
    expect(store.getDiagnostics()).toEqual({ listenerCount: 0, stateCount: ids.length })
  })

  it('projects removed and unknown terminals to one stable idle state', () => {
    const store = createTerminalStateStore({ terminal: createTerminalState('terminal') })
    const listener = vi.fn()
    store.subscribe('terminal', listener)

    store.replaceStates({})

    expect(listener).toHaveBeenCalledOnce()
    expect(store.getState('terminal')).toBe(store.getState('missing'))
    expect(store.getState('terminal')).toMatchObject({
      output: '',
      sessionId: null,
      status: 'idle'
    })
  })

  it('lets a parked leaf pause notifications and read the latest state when resumed', () => {
    const initial = createTerminalState('terminal')
    const store = createTerminalStateStore({ terminal: initial })
    const renderCounts = new Map<string, number>()
    const view = render(
      <TerminalStateProbe enabled={false} id="terminal" renderCounts={renderCounts} store={store} />
    )

    renderCounts.clear()
    const runningState = { ...initial, status: 'running' as const }
    act(() => store.replaceStates({ terminal: runningState }))

    expect(renderCounts).toEqual(new Map())
    expect(store.getDiagnostics().listenerCount).toBe(0)

    view.rerender(<TerminalStateProbe id="terminal" renderCounts={renderCounts} store={store} />)
    expect(view.getByText('running')).toBeInTheDocument()
    expect(store.getDiagnostics().listenerCount).toBe(1)
  })
})

function TerminalStateProbe({
  enabled = true,
  id,
  renderCounts,
  store
}: {
  readonly enabled?: boolean
  readonly id: string
  readonly renderCounts: Map<string, number>
  readonly store: ReturnType<typeof createTerminalStateStore>
}) {
  const state = useTerminalState(store, id, undefined, enabled)
  renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1)
  return <output data-terminal-id={id}>{state.status}</output>
}

function createTerminalState(id: string): TerminalViewState {
  return {
    autoStartStatus: 'succeeded',
    output: id,
    sessionId: `session-${id}`,
    status: 'exited'
  }
}
