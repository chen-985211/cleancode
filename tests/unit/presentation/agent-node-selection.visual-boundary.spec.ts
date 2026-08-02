import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const agentConsoleStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/agent-console.css'),
  'utf8'
)

function readRule(styles: string, selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('}')[0] ?? ''
}

describe('Agent node selection visual boundary', () => {
  it('emphasizes the node outside its content without tinting the Agent terminal', () => {
    const selectedRule = readRule(agentConsoleStyles, '.agent-console-node--selected')
    const selectionVeilRule = readRule(
      agentConsoleStyles,
      '.agent-console-node > .workbench-node-selection-veil'
    )

    expect(selectedRule).toContain('0 0 0 2px var(--cc-primary-border)')
    expect(selectedRule).toContain('var(--cc-shadow-node)')
    expect(selectionVeilRule).toContain('background: transparent;')
  })
})
