import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const agentConsoleStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/workbench/nodes/agent/agent-console.css'),
  'utf8'
)
const selectionStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/workbench/nodes/workbench-node-selection.css'),
  'utf8'
)
const canvasStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/workbench/workbench-canvas.css'),
  'utf8'
)
const contextMenuStyles = readFileSync(
  resolve(
    process.cwd(),
    'src/presentation/app-shell/workbench/menus/canvas-object-context-menu.css'
  ),
  'utf8'
)

function readRule(styles: string, selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('}')[0] ?? ''
}

describe('Agent node selection visual boundary', () => {
  it('uses one strong solid boundary without tinting node content', () => {
    const selectedRule = readRule(agentConsoleStyles, '.agent-console-node--selected')
    const selectionVeilRule = readRule(selectionStyles, '.workbench-node-selection-veil')

    expect(selectionVeilRule).toContain('border: 2px solid var(--cc-primary-border);')
    expect(selectionVeilRule).toContain('background: transparent;')
    expect(selectionVeilRule).toContain('box-shadow: var(--cc-shadow-node);')
    expect(selectionVeilRule).not.toContain('dashed')
    expect(selectedRule).not.toContain('0 0 0 2px')
  })

  it('uses the same strong solid treatment for normal and context-selected workflow edges', () => {
    const selectedEdgeRule = readRule(
      canvasStyles,
      '.react-flow__edge.selected .react-flow__edge-path'
    )
    const contextEdgeRule = readRule(
      contextMenuStyles,
      '.terminal-workflow-edge--context-selected .react-flow__edge-path'
    )

    for (const rule of [selectedEdgeRule, contextEdgeRule]) {
      expect(rule).toContain('stroke: var(--cc-primary);')
      expect(rule).toContain('stroke-width: 3;')
      expect(rule).toContain('stroke-dasharray: none;')
    }
  })
})
