import type { Page } from 'playwright'

import type { AgentRuntimeChangedEvent } from '../../src/contexts/agent/application/dto/AgentSessionProtocol'

export const agentLaunchReadyTimeoutMs = 15_000

export interface AgentLaunchReadySnapshot {
  readonly agentId: string
  readonly generation: number
  readonly launchId: string
  readonly processId: number
  readonly sessionId: string
}

export function getAgentLaunchReadySnapshot(
  event: AgentRuntimeChangedEvent
): AgentLaunchReadySnapshot | null {
  const { launch, terminal } = event.runtime
  if (
    terminal.status !== 'running' ||
    launch.status !== 'running' ||
    terminal.processId === null ||
    launch.launchId === null ||
    launch.generation <= 0
  ) {
    return null
  }

  return {
    agentId: event.agentId,
    generation: launch.generation,
    launchId: launch.launchId,
    processId: terminal.processId,
    sessionId: event.sessionId
  }
}

export function getAgentRuntimeFailure(event: AgentRuntimeChangedEvent): string | null {
  const { launch, terminal } = event.runtime
  if (terminal.status === 'failed') return 'terminal status is failed'
  if (terminal.status === 'exited') return 'terminal status is exited'
  if (launch.status === 'failed') return 'launch status is failed'
  if (launch.status === 'exited' || launch.status === 'stopped') {
    return `launch status is ${launch.status}`
  }
  return null
}

export async function waitForAgentLaunchReady(
  page: Page,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<AgentLaunchReadySnapshot> {
  return page.evaluate((timeout) => {
    const api = window.cleancode
    if (!api?.onAgentRuntimeChanged) {
      throw new Error('Agent runtime events are unavailable.')
    }

    return new Promise<AgentLaunchReadySnapshot>((resolve, reject) => {
      let settled = false
      let unsubscribe = (): void => undefined
      let lastEvent: unknown = null

      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        unsubscribe()
        callback()
      }

      const timeoutId = window.setTimeout(() => {
        finish(() => {
          reject(
            new Error(
              `Timed out waiting for Agent launch ready after ${timeout}ms. Last runtime event: ${JSON.stringify(lastEvent)}`
            )
          )
        })
      }, timeout)

      const handleRuntimeEvent = (event: {
        readonly agentId: string
        readonly runtime: {
          readonly launch: {
            readonly generation: number
            readonly launchId: string | null
            readonly status: string
          }
          readonly terminal: {
            readonly processId: number | null
            readonly status: string
          }
        }
        readonly sessionId: string
      }): void => {
        lastEvent = event
        const { launch, terminal } = event.runtime
        if (terminal.status === 'failed' || terminal.status === 'exited') {
          finish(() => reject(new Error(`Agent terminal ${terminal.status} before launch ready.`)))
          return
        }
        if (
          launch.status === 'failed' ||
          launch.status === 'exited' ||
          launch.status === 'stopped'
        ) {
          finish(() => reject(new Error(`Agent launch ${launch.status} before launch ready.`)))
          return
        }
        if (
          terminal.status !== 'running' ||
          launch.status !== 'running' ||
          terminal.processId === null ||
          launch.launchId === null ||
          launch.generation <= 0
        ) {
          return
        }
        finish(() =>
          resolve({
            agentId: event.agentId,
            generation: launch.generation,
            launchId: launch.launchId as string,
            processId: terminal.processId as number,
            sessionId: event.sessionId
          })
        )
      }

      unsubscribe = api.onAgentRuntimeChanged(handleRuntimeEvent)
      if (settled) unsubscribe()
    })
  }, timeoutMs)
}
