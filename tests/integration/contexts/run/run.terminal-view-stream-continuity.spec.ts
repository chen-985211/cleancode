import { createRequire } from 'node:module'

import type { Terminal as HeadlessTerminalInstance } from '@xterm/headless'
import type { Unicode11Addon as Unicode11AddonInstance } from '@xterm/addon-unicode11'

import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'

const nodeRequire = createRequire(import.meta.url)
const { Terminal } = nodeRequire('@xterm/headless') as {
  readonly Terminal: new (options: {
    allowProposedApi: boolean
    cols: number
    rows: number
    convertEol: boolean
  }) => HeadlessTerminalInstance
}

const { Unicode11Addon } = nodeRequire('@xterm/addon-unicode11') as {
  readonly Unicode11Addon: new () => Unicode11AddonInstance
}

const identity = {
  projectId: 'project-app',
  projectDirectory: '/work/app',
  workspaceId: 'main',
  workspaceDirectory: '/work/app',
  gitBranch: 'main',
  blockId: 'block-1',
  sessionId: 'session-1',
  runId: 'run-1',
  generation: 1
}

const sequences = [
  { name: 'cursor CSI', sequence: '\u001b[2;1H' },
  { name: 'C1 cursor CSI', sequence: '\u009b2;1H' },
  { name: 'true color', sequence: '\u001b[38;2;12;34;56m' },
  { name: 'CSI with executed line feed', sequence: '\u001b[2;\n1H' },
  { name: 'CSI with ignored DEL', sequence: '\u001b[2;\u007f1H' },
  { name: 'CSI subparameters', sequence: '\u001b[38:2::12:34:56m' },
  { name: 'CSI intermediate', sequence: '\u001b[1 q' },
  { name: 'cancelled CSI', sequence: '\u001b[2;\u0018text' },
  { name: 'replaced CSI', sequence: '\u001b[2;\u001b[3;1H' },
  { name: 'ignored CSI', sequence: '\u001b[0<20H' },
  { name: 'OSC title BEL', sequence: '\u001b]2;中文 title\u0007' },
  { name: 'OSC title ST', sequence: '\u001b]2;title\u001b\\' },
  { name: 'C1 OSC title', sequence: '\u009d2;title\u009c' },
  { name: 'OSC ignored controls', sequence: '\u001b]2;ti\n\u007ftle\u0007' },
  { name: 'DCS status query', sequence: '\u001bP$qm\u001b\\' },
  { name: 'DCS parameters', sequence: '\u001bP1;2+qignored\u001b\\' },
  { name: 'DCS ignored header', sequence: '\u001bP0<ignored\u001b\\' },
  { name: 'DCS payload controls', sequence: '\u001bP$q\nm\u001b\\' },
  { name: 'C1 DCS', sequence: '\u0090$qm\u009c' },
  { name: 'ignored SOS', sequence: '\u001bXignored\u001b\\' },
  { name: 'ignored APC', sequence: '\u009fignored\u009c' },
  { name: 'unicode in SOS', sequence: '\u001bX中文' },
  { name: 'UTF-16 surrogate pair', sequence: '😀' },
  { name: 'BOM inside CSI', sequence: '\u001b[2;\ufeff1H' }
]
const splitCases = sequences.flatMap(({ name, sequence }) =>
  Array.from({ length: sequence.length }, (_, splitAt) => ({ name, sequence, splitAt }))
)

describe('terminal view stream continuity', () => {
  it.each(splitCases)(
    'restores $name split at $splitAt with the same screen as uninterrupted output',
    async ({ splitAt, sequence }) => {
      const model = new HeadlessTerminalModelAdapter()
      const view = createView()
      const uninterrupted = createView()
      const actualResponses: string[] = []
      const referenceResponses: string[] = []
      view.onData((response) => actualResponses.push(response))
      uninterrupted.onData((response) => referenceResponses.push(response))
      try {
        model.create({
          identity,
          columns: 40,
          rows: 8,
          workingDirectory: '/work/app',
          onQueryResponse: (response) => actualResponses.push(response),
          onFlowControlChange: () => undefined
        })
        await new Promise<void>((resolve) => uninterrupted.write(`ready${sequence}next`, resolve))
        model.acceptOutput(identity, `ready${sequence.slice(0, splitAt)}`)
        const snapshot = await model.attachView({
          identity,
          viewId: 'new-view',
          onOutput: (event) => view.write(event.output.data)
        })
        await new Promise<void>((resolve) => view.write(snapshot.content, resolve))
        model.acceptOutput(identity, `${sequence.slice(splitAt)}next`)
        await model.flush(identity)
        await new Promise<void>((resolve) => view.write('', resolve))

        expect(readScreen(view)).toEqual(readScreen(uninterrupted))
        expect(actualResponses).toEqual(referenceResponses)
      } finally {
        view.dispose()
        uninterrupted.dispose()
        model.disposeAll()
      }
    }
  )

  it('preserves an unfinished sequence through checkpoint recovery and repeated view attachment', async () => {
    const original = createModel()
    const restored = new HeadlessTerminalModelAdapter()
    const view = createView()
    try {
      original.acceptOutput(identity, 'ready\u001b[2;')
      const checkpoint = await original.captureCheckpoint(identity)
      await restored.restoreCheckpoint({
        checkpoint,
        onQueryResponse: () => undefined,
        onFlowControlChange: () => undefined
      })
      await restored.attachView({ identity, viewId: 'first', onOutput: () => undefined })
      await restored.detachView(identity, 'first')
      const snapshot = await restored.attachView({
        identity,
        viewId: 'second',
        onOutput: (event) => view.write(event.output.data)
      })
      await new Promise<void>((resolve) => view.write(snapshot.content, resolve))
      const output = restored.acceptOutput(identity, '1Hnext')
      await restored.flush(identity)
      await new Promise<void>((resolve) => view.write('', resolve))

      expect(output.sequence).toBe(checkpoint.sequence + 1)
      expect(view.buffer.normal.getLine(0)?.translateToString(true)).toBe('ready')
      expect(view.buffer.normal.getLine(1)?.translateToString(true)).toBe('next')
    } finally {
      original.disposeAll()
      restored.disposeAll()
      view.dispose()
    }
  })

  it('rejects an oversized unfinished sequence without stealing the current view or leaving output paused', async () => {
    const paused: boolean[] = []
    const model = createModel((value) => paused.push(value))
    const received: string[] = []
    try {
      await model.attachView({
        identity,
        viewId: 'existing',
        onOutput: (event) => received.push(event.output.data)
      })
      model.acceptOutput(identity, `\u001b]2;${'x'.repeat(1024 * 1024)}`)
      await expect(
        model.attachView({
          identity,
          viewId: 'replacement',
          onOutput: () => undefined
        })
      ).rejects.toMatchObject({ code: 'TERMINAL_RECOVERY_STORAGE_LIMIT' })
      expect(paused.at(-1)).toBe(false)
      model.acceptOutput(identity, '\u0007next')
      expect(received.at(-1)).toBe('\u0007next')
      const snapshot = await model.attachView({
        identity,
        viewId: 'replacement',
        onOutput: () => undefined
      })
      expect(snapshot.transcript).toBe('next')
      expect(snapshot.content.length).toBeLessThan(100)
    } finally {
      model.disposeAll()
    }
  })
})

function readScreen(terminal: HeadlessTerminalInstance) {
  const buffer = terminal.buffer.active
  return {
    cursor: { x: buffer.cursorX, y: buffer.cursorY },
    modes: terminal.modes,
    lines: Array.from({ length: buffer.length }, (_, index) => {
      const line = buffer.getLine(index)!
      return Array.from({ length: terminal.cols }, (_, column) => {
        const cell = line.getCell(column)!
        return [cell.getChars(), cell.getWidth(), cell.getFgColor(), cell.getBgColor()]
      })
    })
  }
}

function createModel(onFlowControlChange: (paused: boolean) => void = () => undefined) {
  const model = new HeadlessTerminalModelAdapter()
  model.create({
    identity,
    columns: 40,
    rows: 8,
    workingDirectory: '/work/app',
    onQueryResponse: () => undefined,
    onFlowControlChange
  })
  return model
}

function createView() {
  const view = new Terminal({ allowProposedApi: true, cols: 40, rows: 8, convertEol: true })
  view.loadAddon(
    new Unicode11Addon() as unknown as Parameters<HeadlessTerminalInstance['loadAddon']>[0]
  )
  view.unicode.activeVersion = '11'
  return view
}
