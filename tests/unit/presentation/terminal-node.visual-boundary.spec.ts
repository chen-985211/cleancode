import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const terminalNodeStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/terminal-node.css'),
  'utf8'
)

function readRule(selector: string): string {
  return terminalNodeStyles.split(`${selector} {`)[1]?.split('}')[0] ?? ''
}

describe('terminal node visual boundary', () => {
  it('closes the right edge without moving the full-bleed terminal viewport', () => {
    const frameRule = readRule('.terminal-frame')
    const rightEdgeRule = readRule('.terminal-frame::after')
    const outputShellRule = readRule('.terminal-output-shell')

    expect(frameRule).toContain('position: relative;')
    expect(rightEdgeRule).toContain('position: absolute;')
    expect(rightEdgeRule).toContain('z-index: 2;')
    expect(rightEdgeRule).toContain('inset: 0 0 0 auto;')
    expect(rightEdgeRule).toContain('width: 1px;')
    expect(rightEdgeRule).toContain('background: var(--terminal-border);')
    expect(rightEdgeRule).toContain("content: '';")
    expect(rightEdgeRule).toContain('pointer-events: none;')
    expect(outputShellRule).toContain('padding: 9px 0 9px 10px;')
  })
})
