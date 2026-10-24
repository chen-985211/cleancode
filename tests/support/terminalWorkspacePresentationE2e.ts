import type { Locator, Page } from 'playwright'

interface TerminalTarget {
  readonly kind: 'agent' | 'terminal'
  readonly sessionId: string
}

interface SwitchMeasurement {
  latencyMs: number
  blankFrames: number
  sampledFrames: number
  blankReasons: string[]
  completed: boolean
}

declare global {
  interface Window {
    terminalSwitchMeasurement: SwitchMeasurement
  }
}

/** Start on the real click; keep checking after the first ready frame for delayed flicker. */
export async function armTerminalWorkspaceMeasurement(
  button: Locator,
  targets: readonly TerminalTarget[]
): Promise<void> {
  await button.evaluate((element, terminals) => {
    const result: SwitchMeasurement = {
      latencyMs: -1,
      blankFrames: 0,
      sampledFrames: 0,
      blankReasons: [],
      completed: false
    }
    window.terminalSwitchMeasurement = result
    element.addEventListener(
      'click',
      () => {
        const startedAt = performance.now()
        const frameTasks = new MessageChannel()
        frameTasks.port1.onmessage = () => {
          const elapsed = performance.now() - startedAt
          if (element.getAttribute('aria-current') === 'page') {
            const missing = terminals.flatMap(({ kind, sessionId }) => {
              const selector =
                kind === 'agent'
                  ? '.agent-terminal-viewport[data-agent-terminal-session-id'
                  : '.terminal-viewport[data-terminal-attached-session-id'
              const viewport = document.querySelector<HTMLElement>(
                `${selector}="${CSS.escape(sessionId)}"]`
              )
              const xterm = viewport?.querySelector<HTMLElement>('.xterm')
              if (!viewport || !xterm)
                return [`${sessionId}: no ${viewport ? 'xterm' : 'viewport'}`]
              const opacity = getComputedStyle(xterm).opacity
              const height = xterm.getBoundingClientRect().height
              return viewport.dataset.terminalContentReady === 'true' &&
                opacity === '1' &&
                height > 0
                ? []
                : [`${sessionId}: ${viewport.dataset.terminalContentReady}/${opacity}/${height}`]
            })
            result.sampledFrames += 1
            if (missing.length) {
              result.blankFrames += 1
              result.blankReasons.push(...missing)
            } else if (result.latencyMs < 0) result.latencyMs = elapsed
          }
          if (result.sampledFrames >= 20 || elapsed >= 5000) {
            result.completed = true
            frameTasks.port1.close()
            frameTasks.port2.close()
          } else requestAnimationFrame(() => frameTasks.port2.postMessage(null))
        }
        // Read after this frame's xterm rendering callbacks have all run.
        requestAnimationFrame(() => frameTasks.port2.postMessage(null))
      },
      { once: true }
    )
  }, targets)
}

export async function readTerminalWorkspaceMeasurement(page: Page): Promise<SwitchMeasurement> {
  await page.waitForFunction(() => window.terminalSwitchMeasurement?.completed)
  return page.evaluate(() => window.terminalSwitchMeasurement)
}
