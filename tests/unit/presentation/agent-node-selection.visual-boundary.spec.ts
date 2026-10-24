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
const themeStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/theme.css'),
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
  it.each([
    { theme: ":root[data-theme='light']", nodeColor: '#9fb3c8', edgeColor: '#9fb3c8' },
    { theme: ":root[data-theme='dark']", nodeColor: '#adb5bd', edgeColor: '#95c9ff' }
  ])(
    'keeps theme-specific node selection separate from selected edges in $theme',
    ({ theme, nodeColor, edgeColor }) => {
      const themeRule = readRule(themeStyles, theme)

      expect(themeRule).toContain(`--cc-workbench-node-selection: ${nodeColor};`)
      expect(themeRule).toContain(`--cc-workbench-edge-selection: ${edgeColor};`)
    }
  )

  it('uses one strong solid boundary without tinting node content', () => {
    const selectedRule = readRule(agentConsoleStyles, '.agent-console-node--selected')
    const selectionVeilRule = readRule(selectionStyles, '.workbench-node-selection-veil')

    expect(selectionVeilRule).toContain('border: 2px solid var(--cc-workbench-node-selection);')
    expect(selectionVeilRule).toContain('background: transparent;')
    expect(selectionVeilRule).toContain('box-shadow: var(--cc-shadow-node);')
    expect(selectionVeilRule).not.toContain('dashed')
    expect(selectedRule).not.toContain('0 0 0 2px')
  })

  it('uses the same strong solid treatment for normal and context-selected workflow edges', () => {
    const selectedEdgeRule = readRule(
      canvasStyles,
      '.react-flow__edge.selected path.react-flow__edge-path'
    )
    const contextEdgeRule = readRule(
      contextMenuStyles,
      '.react-flow__edge.terminal-workflow-edge--context-selected path.react-flow__edge-path'
    )

    for (const rule of [selectedEdgeRule, contextEdgeRule]) {
      expect(rule).toContain('stroke: var(--cc-workbench-edge-selection);')
      expect(rule).toContain('stroke-width: 3;')
      expect(rule).toContain('stroke-dasharray: none;')
    }
  })
})
