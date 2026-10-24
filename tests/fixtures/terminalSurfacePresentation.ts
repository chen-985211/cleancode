import '@xterm/xterm/css/xterm.css'

import type { TerminalSnapshot } from '../../src/contexts/run/application/dto/TerminalModelSnapshot'
import {
  TerminalSurfaceRegistry,
  type TerminalSurfaceLease
} from '../../src/contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import { createTerminalXtermSurface } from '../../src/contexts/run/presentation/terminal-surface/terminalXtermSurface'

const identity = {
  projectId: 'project',
  workspaceId: 'workspace',
  blockId: 'terminal',
  sessionId: 'session',
  runId: 'run',
  generation: 1,
  projectDirectory: '/fixture',
  workspaceDirectory: '/fixture',
  gitBranch: 'main'
}
let constructions = 0
const registry = new TerminalSurfaceRegistry(() => {
  constructions += 1
  return createTerminalXtermSurface('dark')
})
let current: {
  lease: TerminalSurfaceLease
  host: HTMLDivElement
  observer: MutationObserver
} | null = null
let previousElement: HTMLElement | null = null
let dimensions = { columns: 80, rows: 24 }
let firstFrame: {
  colors: number[][]
  hiddenBeforeReady: boolean
  renderer: string | undefined
  text: string | null
} | null = null
let hiddenBeforeReady = true
let content = ''
let sequence = 0
let restoreCalls = 0
let detachCalls = 0
let hiddenLease: TerminalSurfaceLease | null = null
const responses: string[] = []

document.body.style.cssText = 'margin:24px;background:#202020;color:white;'

function readRowColors(host: HTMLElement): number[][] {
  const canvas = Array.from(host.querySelectorAll('canvas')).find((element) =>
    element.getContext('webgl2')
  )
  if (!canvas) return []
  const gl = canvas.getContext('webgl2')!
  return Array.from({ length: dimensions.rows }, (_, row) => {
    const pixel = new Uint8Array(4)
    gl.readPixels(
      Math.floor(canvas.width * 0.8),
      Math.floor((canvas.height * (row + 0.5)) / dimensions.rows),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel
    )
    return Array.from(pixel)
  })
}

function unmount(retainMounted = false): void {
  if (!current) return
  const { lease, host, observer } = current
  previousElement = host.querySelector('.xterm')
  hiddenLease = lease
  if (
    !retainMounted ||
    !registry.retain(lease.viewId, {
      detach: async () => {
        detachCalls += 1
      },
      onInput: (input) => responses.push(input)
    })
  ) {
    lease.surface.detach(host)
    // This fixture represents the successfully acknowledged detach boundary.
    registry.release(lease.viewId, { retain: true })
  }
  observer.disconnect()
  host.remove()
  current = null
}

function mount(options: { generation?: number; width?: number; hot?: boolean } = {}) {
  unmount(options.hot)
  firstFrame = null
  hiddenBeforeReady = true
  const host = document.createElement('div')
  host.id = 'terminal'
  host.style.cssText = `width:${options.width ?? 800}px;height:360px;`
  document.body.append(host)
  const scope = { ...identity, generation: options.generation ?? 1 }
  const lease = registry.create(scope)
  const observer = new MutationObserver(() => {
    const element = host.querySelector<HTMLElement>('.xterm')
    if (host.dataset.terminalContentReady !== 'true') {
      hiddenBeforeReady &&= !element || getComputedStyle(element).opacity === '0'
    } else if (!firstFrame) {
      firstFrame = {
        colors: readRowColors(host),
        hiddenBeforeReady,
        renderer: host.dataset.terminalRenderer,
        text: host.querySelector('.xterm-rows')?.textContent ?? null
      }
    }
  })
  observer.observe(host, { attributes: true, childList: true, subtree: true })
  lease.surface.attach({
    element: host,
    resume: lease.retained,
    isResizeSuspended: false,
    onDimensionsChange: (value) => {
      dimensions = value
    },
    onInput: (input) => responses.push(input),
    onOpenLink: () => undefined,
    onOpenSearch: () => undefined,
    onRestoreRequired: () => undefined,
    onSearchResultsChange: () => undefined
  })
  current = { lease, host, observer }
  return {
    constructions,
    retained: Boolean(lease.retained),
    reusedElement: previousElement !== null && host.querySelector('.xterm') === previousElement,
    viewId: lease.viewId
  }
}

async function restore(color: 'green' | 'blue' | 'unchanged') {
  restoreCalls += 1
  if (!current) throw new Error('Mount the terminal first.')
  if (color !== 'unchanged') {
    const rgb = color === 'green' ? '0;128;0' : '0;0;192'
    const history =
      '\x1b[48;2;192;0;0m\x1b[2Kold history\r\n'.repeat(600) +
      '\x1b[2Kold history marker\r\n' +
      '\x1b[2Kold history\r\n'.repeat(600)
    const screen = Array.from(
      { length: dimensions.rows },
      (_, row) => `\x1b[48;2;${rgb}m\x1b[2K${color} latest ${row + 1}`
    ).join('\r\n')
    content = `\x1b[?25l${history}${screen}`
    sequence += 1
  }
  const snapshot: TerminalSnapshot = {
    identity,
    sequence,
    content,
    dimensions,
    scrollbackRows: 1000,
    unicodeVersion: '11',
    terminalSourceTheme: 'dark',
    title: '',
    transcript: '',
    workingDirectory: '/fixture',
    restoreMarker: { viewId: current.lease.viewId, sequence },
    modes: {
      applicationCursorKeysMode: false,
      applicationKeypadMode: false,
      bracketedPasteMode: false,
      insertMode: false,
      mouseTrackingMode: 'none',
      originMode: false,
      reverseWraparoundMode: false,
      sendFocusMode: false,
      synchronizedOutputMode: false,
      wraparoundMode: true
    }
  }
  return current.lease.surface.restore(snapshot)
}

const fixture = {
  mount,
  readHistory: () => {
    current?.lease.surface.find('old history marker', 'incremental')
    current?.lease.surface.clearSearch()
  },
  unmount,
  hide: () => unmount(true),
  writeHidden: () => {
    if (!hiddenLease) throw new Error('Hide a mounted terminal first.')
    sequence += 1
    const screen = Array.from(
      { length: dimensions.rows },
      (_, row) => `\x1b[48;2;0;0;192m\x1b[2Kblue latest ${row + 1}`
    ).join('\r\n')
    registry.write({
      scope: identity,
      sessionId: identity.sessionId,
      viewId: hiddenLease.viewId,
      output: { sequence, data: `\x1b[H\x1b[2J${screen}\x1b[6n\x1b]10;?\x07` }
    })
  },
  switchHot: async (): Promise<{
    retained: boolean
    reusedElement: boolean
    sameViewId: boolean
    restoreCalls: number
    blankFrames: number
    firstReadyMs: number | null
    firstColors: number[][] | null
  }> => {
    const startedAt = performance.now()
    const previousViewId = current?.lease.viewId ?? hiddenLease?.viewId
    const previousRestores = restoreCalls
    const result = mount({ hot: true })
    let blankFrames = 0
    let firstReadyMs: number | null = null
    let firstColors: number[][] | null = null
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          const host = current!.host
          const element = host.querySelector<HTMLElement>('.xterm')
          if (
            host.dataset.terminalContentReady !== 'true' ||
            !element ||
            getComputedStyle(element).opacity === '0'
          )
            blankFrames += 1
          else firstReadyMs ??= performance.now() - startedAt
          firstColors ??= readRowColors(host)
          resolve()
        })
      )
    }
    return {
      ...result,
      blankFrames,
      firstReadyMs,
      firstColors,
      sameViewId: result.viewId === previousViewId,
      restoreCalls: restoreCalls - previousRestores
    }
  },
  restore,
  state: () => ({
    firstFrame,
    dimensions,
    constructions,
    responses,
    detachCalls,
    colors: current ? readRowColors(current.host) : [],
    ready: current?.host.dataset.terminalContentReady,
    opacity: current?.host.querySelector<HTMLElement>('.xterm')?.style.opacity
  }),
  dispose: () => {
    unmount()
    registry.disposeAll()
  }
}

declare global {
  interface Window {
    terminalPresentationFixture: typeof fixture
  }
}
window.terminalPresentationFixture = fixture
