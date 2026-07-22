import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import type { WorkbenchFlowNode } from './types'

export function activateWorkbenchNodeInput(node: WorkbenchFlowNode): boolean {
  const container = resolveWorkbenchNodeInputContainer(node)
  const input = container?.querySelector<HTMLElement>('.xterm-helper-textarea')

  if (!input) {
    return false
  }

  input.focus({ preventScroll: true })
  return document.activeElement === input
}

function resolveWorkbenchNodeInputContainer(node: WorkbenchFlowNode): HTMLElement | null {
  if (node.type === 'terminal') {
    return findElementByAttribute('data-terminal-block-id', node.id)
  }

  const agentId = readAgentIdFromFlowNodeId(node.id)
  return agentId ? findElementByAttribute('data-agent-console-node', agentId) : null
}

function findElementByAttribute(attribute: string, value: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).find(
      (element) => element.getAttribute(attribute) === value
    ) ?? null
  )
}
