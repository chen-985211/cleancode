import type { Terminal } from '@xterm/headless'

// SerializeAddon stores cell color operands, but not the OSC palette they refer to.
export class TerminalPaletteCheckpoint {
  private readonly indexed = new Map<number, string>()
  private readonly defaults = new Map<number, string>()

  constructor(terminal: Terminal) {
    terminal.parser.registerOscHandler(4, (data) => {
      const fields = data.split(';')
      for (let i = 1; i < fields.length; i += 2) {
        const slot = ansiIndex(fields[i - 1]!)
        if (slot !== undefined) storeColor(this.indexed, slot, fields[i]!)
      }
      return false
    })
    terminal.parser.registerOscHandler(104, (data) => {
      if (data === '') this.indexed.clear()
      else {
        for (const field of data.split(';')) {
          const slot = ansiIndex(field)
          if (slot !== undefined) this.indexed.delete(slot)
        }
      }
      return false
    })

    for (const code of [10, 11, 12]) {
      terminal.parser.registerOscHandler(code, (data) => {
        // OSC 10/11 may set consecutive default slots in a single command.
        for (const [i, color] of data.split(';', 13 - code).entries()) {
          storeColor(this.defaults, code + i, color)
        }
        return false
      })
      terminal.parser.registerOscHandler(code + 100, () => {
        this.defaults.delete(code)
        return false
      })
    }
  }

  serialize(): string {
    const colors = []
    for (const [slot, color] of this.indexed) colors.push(`\x1b]4;${slot};${color}\x07`)
    for (const [code, color] of this.defaults) colors.push(`\x1b]${code};${color}\x07`)
    return colors.join('')
  }
}

function ansiIndex(field: string): number | undefined {
  const slot = Number(field)
  return /^\d+$/u.test(field) && slot <= 255 ? slot : undefined
}

function storeColor(palette: Map<number, string>, slot: number, operand: string): void {
  if (!isXtermColor(operand)) return
  // A split field can retain the entire OSC input. Copy just the validated
  // ASCII operand and let xterm perform its usual color conversion on replay.
  palette.set(slot, Buffer.from(operand, 'ascii').toString('ascii'))
}

// An invalid assignment or a query must not displace an earlier valid color.
function isXtermColor(value: string): boolean {
  if (/^#(?:[0-9a-f]{3}){1,4}$/iu.test(value)) return true
  const rgb = /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/iu.exec(value)
  return !!rgb && rgb[1]!.length === rgb[2]!.length && rgb[1]!.length === rgb[3]!.length
}
