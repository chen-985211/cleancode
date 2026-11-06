import { canonicalTerminalPalettes } from '../../src/contexts/run/application/dto/TerminalPalette.generated'
import { createRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import '../../src/presentation/app-shell/shell/AppShell.css'
import { TerminalThemeProjection } from '../../src/contexts/run/presentation/components/TerminalThemeProjection'
import type { TerminalColorPair } from '../../src/contexts/run/presentation/terminal-surface/terminalTheme'
import { createTerminalXtermSurface } from '../../src/contexts/run/presentation/terminal-surface/terminalXtermSurface'
import { applyEffectiveTheme } from '../../src/presentation/app-shell/app-features/settings/themePreference'

const params = new URLSearchParams(location.search)
const source = params.get('source') === 'light' ? 'light' : 'dark'
const ordinary = params.get('host') === 'terminal'
applyEffectiveTheme(source)
const ref = createRef<HTMLDivElement>()
const root = createRoot(document.getElementById('root')!)
const projection = (
  <TerminalThemeProjection sourceTheme={source}>
    <div className={ordinary ? 'terminal-viewport' : 'agent-terminal-viewport'} ref={ref} />
  </TerminalThemeProjection>
)
flushSync(() =>
  root.render(ordinary ? <div className="terminal-output-shell">{projection}</div> : projection)
)
const surface = createTerminalXtermSurface(source)
let dimensions = { columns: 80, rows: 24 }
let sequence = 0
const noop = (): void => {}
const input: string[] = []
surface.attach({
  element: ref.current!,
  isResizeSuspended: false,
  onDimensionsChange: (value) => {
    dimensions = value
  },
  onInput: (data) => input.push(data),
  onOpenLink: noop,
  onOpenSearch: noop,
  onRestoreRequired: noop,
  onSearchResultsChange: noop
})
await surface.workloadTarget?.runInitialization?.()
const identity = {
  projectId: 'project',
  workspaceId: 'workspace',
  blockId: 'block',
  sessionId: 'session',
  runId: 'run',
  generation: 1,
  projectDirectory: '/fixture',
  workspaceDirectory: '/fixture',
  gitBranch: 'main'
}
async function restoreContent(content: string): Promise<void> {
  await surface.restore({
    identity,
    sequence: ++sequence,
    dimensions,
    content,
    scrollbackRows: 1000,
    unicodeVersion: '11',
    terminalSourceTheme: source,
    title: '',
    transcript: '',
    workingDirectory: '/fixture',
    restoreMarker: { viewId: 'view', sequence },
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
  })
}
const fixture = {
  restoreContent,
  input: () => [...input],
  setColorPairs: (pairs: readonly TerminalColorPair[]) => surface.setColorPairs?.(pairs),
  theme: (value: 'light' | 'dark') => applyEffectiveTheme(value),
  dimensions: () => dimensions,
  zoom: (scale: number) => {
    const element = document.getElementById('root')!
    element.style.transformOrigin = '0 0'
    element.style.transform = 'scale(' + scale + ')'
    surface.rasterTarget?.setRasterScale(scale)
    surface.rasterTarget?.refreshRasterAlignment?.()
  },
  write: async (data: string) => {
    surface.write({ sequence: ++sequence, data })
    await surface.workloadTarget!.drainOutput(null)
  },
  readHistory: () => {
    surface.find('history-anchor', 'previous')
    surface.clearSearch()
  },
  draw: async (background = false, custom = false, rgb?: number[]) => {
    const lines = Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 32 }, (_, x) => {
        const index = 32 * y + x
        const color = rgb?.[index]
        const operand =
          color === undefined
            ? '5;' + index
            : '2;' + [color >>> 16, (color >>> 8) & 255, color & 255].join(';')
        return (
          '\x1b[' +
          (background ? '48;' : '38;') +
          operand +
          'm' +
          (background ? '  ' : '██') +
          '\x1b[0m '
        )
      }).join('')
    )
    lines[0] += 'history-anchor'
    const sourceRgb = canonicalTerminalPalettes[source].foreground
      .slice(1)
      .match(/../gu)!
      .map((channel) => parseInt(channel, 16))
      .join(';')
    const content =
      '\x1b[?25l' +
      (custom ? '\x1b]4;9;rgb:44/66/88\x07' : '\x1b]104;9\x07') +
      lines.join('\r\n') +
      '\r\n\x1b[38;2;46;52;54m██\x1b[0m \x1b[48;2;58;61;64m  \x1b[0m \x1b[7;31m  \x1b[0m ' +
      '\x1b[38;2;' +
      sourceRgb +
      'm██\x1b[0m\r\n██ \x1b[1m██\x1b[0m \x1b[2m██\x1b[0m\r\n\x1b[31m中文 Red\x1b[1;32m 粗体 Bold\x1b[0m'
    await restoreContent(content)
  }
}
declare global {
  interface Window {
    terminalIndexedFixture: typeof fixture
  }
}
window.terminalIndexedFixture = fixture
window.addEventListener(
  'pagehide',
  () => {
    surface.dispose()
    root.unmount()
  },
  { once: true }
)
