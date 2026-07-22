import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { activateWorkbenchNodeInput } from '../../../src/presentation/app-shell/workbenchNodeInputActivation'

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
})
