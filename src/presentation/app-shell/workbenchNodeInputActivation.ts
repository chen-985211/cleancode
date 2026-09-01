import { readAgentIdFromFlowNodeId } from './projections/agentConsoleFlowNode'
import { terminalSurfaceAttachedSessionIdAttribute } from '../../contexts/run/presentation/terminal-surface/terminalSurfaceAttachmentIdentity'
import type { WorkbenchFlowNode } from './types/workbenchFlowNode'

export function activateWorkbenchNodeInput(node: WorkbenchFlowNode): boolean {
  const input = resolveWorkbenchNodeInput(node)

  if (!input) {
    return false
  }

  input.focus({ preventScroll: true })
  return document.activeElement === input
}

export function isExactWorkbenchNodeInputTarget(
  node: WorkbenchFlowNode,
  target: EventTarget | null
): boolean {
  return target instanceof Element && resolveWorkbenchNodeInput(node) === target
}

export function isWorkbenchNodeInputSurfaceReady(node: WorkbenchFlowNode): boolean {
  const container = resolveWorkbenchNodeInputContainer(node)
  return Boolean(container && isWorkbenchNodeInputSurfaceReadyInContainer(node, container))
}

interface WorkbenchNodeInputSurfaceReadiness {
  readonly isReady: () => boolean
  readonly observe: (onChange: (status: 'invalid' | 'ready') => void) => () => void
}

type WorkbenchNodeInputSurfaceReadinessStatus = 'invalid' | 'pending' | 'ready'

export function createWorkbenchNodeInputSurfaceReadiness(
  node: WorkbenchFlowNode
): WorkbenchNodeInputSurfaceReadiness {
  let observedContainer = resolveWorkbenchNodeInputContainer(node)
  const readStatus = (): WorkbenchNodeInputSurfaceReadinessStatus => {
    if (observedContainer && !observedContainer.isConnected) return 'invalid'

    const currentContainer = resolveWorkbenchNodeInputContainer(node)
    if (observedContainer && currentContainer !== observedContainer) return 'invalid'
    observedContainer ??= currentContainer
    if (!currentContainer) return 'pending'

    if (
      node.type === 'agentConsole' &&
      currentContainer
        .querySelector<HTMLElement>('[data-agent-attach-operation-status]')
        ?.getAttribute('data-agent-attach-operation-status') === 'failed'
    ) {
      return 'invalid'
    }

    if (
      node.type === 'terminal' &&
      currentContainer.getAttribute('data-terminal-auto-start-status') === 'failed'
    ) {
      return 'invalid'
    }

    return isWorkbenchNodeInputSurfaceReadyInContainer(node, currentContainer) ? 'ready' : 'pending'
  }

  return {
    isReady: () => readStatus() === 'ready',
    observe: (onChange) => {
      let isObserving = true
      const observer = new MutationObserver(() => inspectReadiness())
      const finish = (status: 'invalid' | 'ready'): void => {
        if (!isObserving) return
        isObserving = false
        observer.disconnect()
        onChange(status)
      }
      const inspectReadiness = (): void => {
        if (!isObserving) return
        const status = readStatus()
        if (status !== 'pending') finish(status)
      }

      observer.observe(document.documentElement, {
        attributeFilter: [
          'data-agent-attach-operation-status',
          'data-agent-terminal-view-session-id',
          'data-terminal-auto-start-status',
          terminalSurfaceAttachedSessionIdAttribute,
          'data-terminal-session-id'
        ],
        attributes: true,
        childList: true,
        subtree: true
      })
      inspectReadiness()

      return () => {
        isObserving = false
        observer.disconnect()
      }
    }
  }
}

function isWorkbenchNodeInputSurfaceReadyInContainer(
  node: WorkbenchFlowNode,
  container: HTMLElement
): boolean {
  const surface = resolveWorkbenchNodeInputSurface(node, container)
  if (!surface?.input || !surface.expectedSessionId) {
    return false
  }

  return (
    surface.viewport.getAttribute(terminalSurfaceAttachedSessionIdAttribute) ===
    surface.expectedSessionId
  )
}

export function observeWorkbenchNodeInputSurfaceReady(
  node: WorkbenchFlowNode,
  onChange: (status: 'invalid' | 'ready') => void
): () => void {
  return createWorkbenchNodeInputSurfaceReadiness(node).observe(onChange)
}

function resolveWorkbenchNodeInputSurface(
  node: WorkbenchFlowNode,
  container: HTMLElement
): {
  readonly expectedSessionId: string | null
  readonly input: HTMLElement | null
  readonly viewport: HTMLElement
} | null {
  const viewport = container.querySelector<HTMLElement>(
    node.type === 'terminal' ? '.terminal-viewport' : '.agent-terminal-viewport'
  )
  if (!viewport) {
    return null
  }

  const expectedSessionId =
    node.type === 'terminal'
      ? (container
          .querySelector<HTMLElement>('[data-terminal-output-tail="true"]')
          ?.getAttribute('data-terminal-session-id') ?? null)
      : viewport.getAttribute('data-agent-terminal-view-session-id')

  return {
    expectedSessionId,
    input: viewport.querySelector<HTMLElement>('.xterm-helper-textarea'),
    viewport
  }
}

function resolveWorkbenchNodeInput(node: WorkbenchFlowNode): HTMLElement | null {
  return (
    resolveWorkbenchNodeInputContainer(node)?.querySelector<HTMLElement>(
      '.xterm-helper-textarea'
    ) ?? null
  )
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
