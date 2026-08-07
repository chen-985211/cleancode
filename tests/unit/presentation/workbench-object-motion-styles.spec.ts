import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const objectMotionStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workbench-object-motion.css'),
  'utf8'
)
const terminalGroupStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/terminal-group-node.css'),
  'utf8'
)
const terminalNodeStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/terminal-node.css'),
  'utf8'
)
const agentConsoleStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/agent-console.css'),
  'utf8'
)

describe('workbench object motion styles', () => {
  it('materializes new objects with clipping and opacity without animating terminal geometry', () => {
    const createKeyframes = readRule('@keyframes workbench-object-create-in')
    const accentKeyframes = readRule('@keyframes workbench-object-create-accent')
    const objectBaseRule = readRule(
      ':is(.terminal-node, .terminal-group-node, .agent-console-node)'
    )

    expect(createKeyframes).toContain('opacity:')
    expect(createKeyframes).not.toContain('clip-path:')
    expect(accentKeyframes).toContain('clip-path:')
    expect(`${createKeyframes}${accentKeyframes}`).not.toMatch(/\b(width|height):/)
    expect(`${createKeyframes}${accentKeyframes}`).not.toContain('scale(')
    expect(objectBaseRule).not.toContain('scale(')
  })

  it('uses symmetric group member paths and disables them for reduced motion', () => {
    const expandKeyframes = readRule('@keyframes workbench-object-group-expand')
    const collapseKeyframes = readRule('@keyframes workbench-object-group-collapse')

    expect(expandKeyframes).toContain('var(--workbench-object-motion-x)')
    expect(expandKeyframes).toContain('translate3d(0, 0, 0)')
    expect(collapseKeyframes).toContain('translate3d(0, 0, 0)')
    expect(collapseKeyframes).toContain('var(--workbench-object-motion-x)')
    expect(objectMotionStyles).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('opens the stationary group surface while members translate into arranged slots', () => {
    const joinKeyframes = readRule('@keyframes workbench-terminal-group-join')
    const reflowKeyframes = readRule('@keyframes workbench-terminal-group-reflow')
    const dropTargetRule = readTerminalGroupRule('.terminal-group-node--drop-join')
    const dropTargetDepthRule = readTerminalGroupRule('.terminal-group-node--drop-join::after')
    const groupRule = readTerminalGroupRule('.terminal-group-node')

    expect(joinKeyframes).toContain('var(--workbench-object-motion-x)')
    expect(joinKeyframes).not.toContain('scale(')
    expect(joinKeyframes).not.toContain('opacity:')
    expect(reflowKeyframes).toContain('var(--workbench-object-motion-x)')
    expect(objectMotionStyles).toContain('.workbench-object-motion--group-join')
    expect(objectMotionStyles).toContain('.workbench-object-motion--group-reflow')
    expect(objectMotionStyles).not.toContain('.workbench-object-motion--group-accept')
    expect(groupRule).toContain('--terminal-group-drop-scale: 1;')
    expect(groupRule).toContain('transform: scale(var(--terminal-group-drop-scale));')
    expect(dropTargetRule).not.toContain('background:')
    expect(dropTargetRule).not.toContain('box-shadow:')
    expect(dropTargetRule).not.toMatch(/\b(border|outline|transform):/)
    expect(dropTargetRule).not.toMatch(/--cc-(primary|success)/)
    expect(dropTargetDepthRule).not.toContain('opacity:')
    expect(objectMotionStyles).not.toContain(
      '.canvas-surface--dragging-terminal:has(.terminal-group-node--drop-join)'
    )
  })

  it('keeps the empty group edit space free of dashed framing and color masks', () => {
    const editingGroupRule = readTerminalGroupRule('.terminal-group-node--editing')
    const emptyStateRule = readTerminalGroupRule('.terminal-group-node__empty-state')
    const editingEmptyStateRule = readTerminalGroupRule(
      '.terminal-group-node--editing .terminal-group-node__empty-state'
    )

    expect(editingGroupRule).not.toContain('background:')
    expect(editingGroupRule).not.toContain('--cc-primary')
    expect(emptyStateRule).not.toContain('dashed')
    expect(editingEmptyStateRule).not.toContain('background:')
    expect(editingEmptyStateRule).not.toContain('border-color:')
  })

  it('keeps the empty group action neutral when the pointer approaches', () => {
    const hoverRule = readTerminalGroupRule('.terminal-group-node__empty-state--action:hover')
    const hoverIconRule = readTerminalGroupRule(
      '.terminal-group-node__empty-state--action:hover svg'
    )

    expect(`${hoverRule}${hoverIconRule}`).not.toContain('var(--cc-primary)')
    expect(`${hoverRule}${hoverIconRule}`).not.toContain('var(--cc-primary-soft)')
    expect(`${hoverRule}${hoverIconRule}`).not.toContain('var(--cc-primary-border)')
  })

  it('keeps ordinary pointer hover free of node transforms', () => {
    const objectBaseRule = readRule(
      ':is(.terminal-node, .terminal-group-node, .agent-console-node)'
    )
    const nodeRules = [
      readStyleRule(terminalNodeStyles, '.terminal-node'),
      readTerminalGroupRule('.terminal-group-node'),
      readStyleRule(agentConsoleStyles, '.agent-console-node')
    ]

    expect(objectBaseRule).not.toContain('--workbench-object-hover-scale')
    expect(objectBaseRule).not.toContain('transform:')
    expect(objectMotionStyles).not.toContain('.workbench-object-hover-motion--active')
    expect(objectMotionStyles).not.toContain('--workbench-object-hover-x')
    expect(objectMotionStyles).not.toContain('--workbench-object-hover-y')
    expect(objectMotionStyles).not.toContain('translate3d(0, -3px, 0)')
    expect(terminalGroupStyles).toContain('.terminal-group-drop-spring--active')
    expect(objectMotionStyles).toContain('.react-flow__node.dragging')
    expect(objectMotionStyles).toContain('@media (prefers-reduced-motion: reduce)')
    nodeRules.forEach((rule) => {
      expect(rule).not.toMatch(/transition:[^;]*\btransform\b/s)
    })
  })

  it('reduces secondary controls by detail level while preserving node identity surfaces', () => {
    expect(objectMotionStyles).toContain("[data-canvas-detail='compact']")
    expect(objectMotionStyles).toContain("[data-canvas-detail='overview']")
    expect(objectMotionStyles).toContain('.terminal-node__actions')
    expect(objectMotionStyles).toContain('.agent-console-actions__center')
    const detailLevelStyles = objectMotionStyles.slice(
      objectMotionStyles.indexOf("[data-canvas-detail='compact']"),
      objectMotionStyles.indexOf('@keyframes')
    )

    expect(detailLevelStyles).not.toContain('visibility: hidden')
    expect(detailLevelStyles).not.toContain('pointer-events: none')
    expect(detailLevelStyles).toContain(':hover, :focus-within')
    expect(objectMotionStyles).not.toMatch(
      /\[data-canvas-detail='overview'\]\s+\.terminal-node\s*\{/
    )
    expect(objectMotionStyles).not.toMatch(
      /\[data-canvas-detail='overview'\]\s+\.agent-console-node\s*\{/
    )
  })
})

function readRule(selector: string): string {
  return objectMotionStyles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}

function readTerminalGroupRule(selector: string): string {
  return terminalGroupStyles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}

function readStyleRule(styles: string, selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
