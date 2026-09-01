import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import {
  activateWorkbenchNodeInput,
  createWorkbenchNodeInputSurfaceReadiness,
  isWorkbenchNodeInputSurfaceReady,
  observeWorkbenchNodeInputSurfaceReady
} from '../../../src/presentation/app-shell/workbenchNodeInputActivation'

describe('workbench node input activation', () => {
  it('activates the xterm input for a terminal node', () => {
    document.body.innerHTML = `
      <section data-terminal-block-id="terminal-1">
        <textarea class="xterm-helper-textarea" aria-label="Terminal input"></textarea>
      </section>
    `

    const activated = activateWorkbenchNodeInput({
      id: 'terminal-1',
      position: { x: 0, y: 0 },
      type: 'terminal'
    } as WorkbenchFlowNode)

    expect(activated).toBe(true)
    expect(document.querySelector('[aria-label="Terminal input"]')).toHaveFocus()
  })

  it('activates the xterm input for an Agent node', () => {
    document.body.innerHTML = `
      <section data-agent-console-node="agent-1">
        <textarea class="xterm-helper-textarea" aria-label="Agent input"></textarea>
      </section>
    `

    const activated = activateWorkbenchNodeInput({
      id: 'agent:agent-1',
      position: { x: 0, y: 0 },
      type: 'agentConsole'
    } as WorkbenchFlowNode)

    expect(activated).toBe(true)
    expect(document.querySelector('[aria-label="Agent input"]')).toHaveFocus()
  })

  it('treats a terminal input as ready only when the attached surface matches its session', () => {
    document.body.innerHTML = `
      <section data-terminal-block-id="terminal-1">
        <div
          class="terminal-viewport"
          data-terminal-attached-session-id="stale-session"
        >
          <textarea class="xterm-helper-textarea"></textarea>
        </div>
        <pre data-terminal-output-tail="true" data-terminal-session-id="session-1"></pre>
      </section>
    `
    const node = {
      id: 'terminal-1',
      position: { x: 0, y: 0 },
      type: 'terminal'
    } as WorkbenchFlowNode

    expect(isWorkbenchNodeInputSurfaceReady(node)).toBe(false)

    document
      .querySelector('.terminal-viewport')
      ?.setAttribute('data-terminal-attached-session-id', 'session-1')

    expect(isWorkbenchNodeInputSurfaceReady(node)).toBe(true)
  })

  it('binds Agent readiness to the Run view identity rather than the outer Agent session', async () => {
    document.body.innerHTML = `
      <section data-agent-console-node="agent-1">
        <div data-agent-attach-operation-status="idle"></div>
        <div
          class="agent-terminal-viewport"
          data-agent-terminal-session-id="agent-session-1"
          data-agent-terminal-view-session-id="terminal-session-2"
          data-terminal-attached-session-id="terminal-session-1"
        >
          <textarea class="xterm-helper-textarea"></textarea>
        </div>
      </section>
    `
    const node = {
      id: 'agent:agent-1',
      position: { x: 0, y: 0 },
      type: 'agentConsole'
    } as WorkbenchFlowNode

    expect(isWorkbenchNodeInputSurfaceReady(node)).toBe(false)
    const onChange = vi.fn()
    const stopObserving = observeWorkbenchNodeInputSurfaceReady(node, onChange)

    document
      .querySelector('.agent-terminal-viewport')
      ?.setAttribute('data-terminal-attached-session-id', 'terminal-session-2')

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('ready'))
    expect(isWorkbenchNodeInputSurfaceReady(node)).toBe(true)
    expect(document.querySelector('.agent-terminal-viewport')).toHaveAttribute(
      'data-agent-terminal-session-id',
      'agent-session-1'
    )
    stopObserving()
  })

  it('invalidates Agent focus when attachment fails and ignores a later matching surface', async () => {
    const node = renderPendingAgentInput()
    const onChange = vi.fn()

    observeWorkbenchNodeInputSurfaceReady(node, onChange)
    document
      .querySelector('[data-agent-attach-operation-status]')
      ?.setAttribute('data-agent-attach-operation-status', 'failed')

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('invalid'))

    document
      .querySelector('[data-agent-attach-operation-status]')
      ?.setAttribute('data-agent-attach-operation-status', 'idle')
    document
      .querySelector('.agent-terminal-viewport')
      ?.setAttribute('data-terminal-attached-session-id', 'terminal-session-2')
    await nextMutationDelivery()

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('invalidates focus when its observed node is removed and ignores a replacement', async () => {
    const node = renderPendingAgentInput()
    const onChange = vi.fn()

    observeWorkbenchNodeInputSurfaceReady(node, onChange)
    document.querySelector('[data-agent-console-node]')?.remove()

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('invalid'))

    renderPendingAgentInput('terminal-session-2')
    await nextMutationDelivery()

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('keeps the original node identity across readiness subscriptions', () => {
    const node = renderReadyTerminalInput()
    const readiness = createWorkbenchNodeInputSurfaceReadiness(node)
    const firstStatus = vi.fn()

    expect(readiness.isReady()).toBe(true)
    readiness.observe(firstStatus)
    expect(firstStatus).toHaveBeenCalledWith('ready')

    renderReadyTerminalInput()

    expect(readiness.isReady()).toBe(false)
    const replacementStatus = vi.fn()
    readiness.observe(replacementStatus)
    expect(replacementStatus).toHaveBeenCalledWith('invalid')
  })

  it('invalidates terminal focus when its auto-start operation fails', async () => {
    document.body.innerHTML = `
      <section data-terminal-block-id="terminal-1" data-terminal-auto-start-status="pending">
        <div class="terminal-viewport">
          <textarea class="xterm-helper-textarea"></textarea>
        </div>
        <pre data-terminal-output-tail="true" data-terminal-session-id=""></pre>
      </section>
    `
    const node = {
      id: 'terminal-1',
      position: { x: 0, y: 0 },
      type: 'terminal'
    } as WorkbenchFlowNode
    const onChange = vi.fn()

    observeWorkbenchNodeInputSurfaceReady(node, onChange)
    document
      .querySelector('[data-terminal-block-id]')
      ?.setAttribute('data-terminal-auto-start-status', 'failed')

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('invalid'))

    document
      .querySelector('[data-terminal-block-id]')
      ?.setAttribute('data-terminal-auto-start-status', 'succeeded')
    document
      .querySelector('[data-terminal-output-tail]')
      ?.setAttribute('data-terminal-session-id', 'terminal-session-1')
    document
      .querySelector('.terminal-viewport')
      ?.setAttribute('data-terminal-attached-session-id', 'terminal-session-1')
    await nextMutationDelivery()

    expect(onChange).toHaveBeenCalledOnce()
  })
})

function renderPendingAgentInput(attachedSessionId = 'terminal-session-1'): WorkbenchFlowNode {
  document.body.innerHTML = `
    <section data-agent-console-node="agent-1">
      <div data-agent-attach-operation-status="pending"></div>
      <div
        class="agent-terminal-viewport"
        data-agent-terminal-session-id="agent-session-1"
        data-agent-terminal-view-session-id="terminal-session-2"
        data-terminal-attached-session-id="${attachedSessionId}"
      >
        <textarea class="xterm-helper-textarea"></textarea>
      </div>
    </section>
  `
  return {
    id: 'agent:agent-1',
    position: { x: 0, y: 0 },
    type: 'agentConsole'
  } as WorkbenchFlowNode
}

async function nextMutationDelivery(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}

function renderReadyTerminalInput(): WorkbenchFlowNode {
  document.body.innerHTML = `
    <section data-terminal-block-id="terminal-1" data-terminal-auto-start-status="succeeded">
      <div class="terminal-viewport" data-terminal-attached-session-id="terminal-session-1">
        <textarea class="xterm-helper-textarea"></textarea>
      </div>
      <pre
        data-terminal-output-tail="true"
        data-terminal-session-id="terminal-session-1"
      ></pre>
    </section>
  `
  return {
    id: 'terminal-1',
    position: { x: 0, y: 0 },
    type: 'terminal'
  } as WorkbenchFlowNode
}
