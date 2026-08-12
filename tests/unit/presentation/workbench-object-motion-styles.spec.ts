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
const themeStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/theme.css'),
  'utf8'
)

describe('workbench object motion styles', () => {
  it('materializes terminals and Agents from their center without changing layout geometry', () => {
    const createKeyframes = readRule('@keyframes workbench-object-create-in')
    const accentKeyframes = readRule('@keyframes workbench-object-create-accent')
    const objectBaseRule = readRule(
      ':is(.terminal-node-anchor, .terminal-node, .terminal-group-node, .agent-console-node)'
    )
    const spatialMotionRule = readRule('.workbench-object-motion--spatial')

    expect(createKeyframes).toContain('opacity:')
    expect(createKeyframes).not.toContain('clip-path:')
    expect(accentKeyframes).toContain('clip-path:')
    expect(`${createKeyframes}${accentKeyframes}`).not.toMatch(/\b(width|height):/)
    expect(`${createKeyframes}${accentKeyframes}`).not.toContain('scale(')
    expect(objectBaseRule).toContain('--workbench-object-motion-scale: 1;')
    expect(objectMotionStyles).toContain('--workbench-object-motion-scale: 0;')
    expect(spatialMotionRule).toContain('scale(var(--workbench-object-motion-scale))')
    expect(objectMotionStyles).toContain(
      '.terminal-group-node.workbench-object-motion--create::before'
    )
    expect(objectMotionStyles).not.toContain(
      '.terminal-node.workbench-object-motion--create::before'
    )
    expect(objectMotionStyles).not.toContain(
      '.agent-console-node.workbench-object-motion--create::before'
    )
  })

  it('presents spring-driven group member paths without a competing CSS animation', () => {
    const spatialMotionRule = readRule('.workbench-object-motion--spatial')
    const collapsingMemberRule = readRule('.terminal-node.workbench-object-motion--group-collapse')

    expect(spatialMotionRule).toContain('var(--workbench-object-motion-x)')
    expect(spatialMotionRule).toContain('var(--workbench-object-motion-y)')
    expect(spatialMotionRule).toContain('var(--workbench-object-motion-opacity)')
    expect(spatialMotionRule).toContain('scale(var(--workbench-object-motion-scale))')
    expect(objectMotionStyles).toMatch(
      /\.terminal-node:is\(\s*\.workbench-object-motion--group-expand,\s*\.workbench-object-motion--group-collapse\s*\)/
    )
    expect(objectMotionStyles).toMatch(
      /\.terminal-node\.workbench-object-motion--group-expand\s*>\s*\*/
    )
    expect(collapsingMemberRule).toContain('visibility: hidden;')
    expect(collapsingMemberRule).toContain('opacity: 0;')
    expect(collapsingMemberRule).toContain('pointer-events: none;')
    expect(spatialMotionRule).not.toContain('animation:')
    expect(objectMotionStyles).not.toContain('@keyframes workbench-object-group-expand')
    expect(objectMotionStyles).not.toContain('@keyframes workbench-object-group-collapse')
    expect(objectMotionStyles).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('morphs one group material between committed geometries while members move', () => {
    const spatialMotionRule = readRule('.workbench-object-motion--spatial')
    const expandingHeaderRule = readRule(
      '.terminal-group-node.workbench-object-motion--group-expand > .terminal-group-node__header'
    )
    const dropTargetRule = readTerminalGroupRule('.terminal-group-node--drop-join')
    const dropTargetDepthRule = readTerminalGroupRule('.terminal-group-node--drop-join::after')
    const groupRule = readTerminalGroupRule('.terminal-group-node')
    const materialRule = readTerminalGroupRule('.terminal-group-node__material')
    const materialFillRule = readTerminalGroupRule('.terminal-group-node__material::before')
    const collapsedMaterialFillRule = readTerminalGroupRule(
      '.terminal-group-node--collapsed > .terminal-group-node__material::before'
    )

    expect(spatialMotionRule).toContain('var(--workbench-object-motion-x)')
    expect(spatialMotionRule).not.toContain('scaleX(')
    expect(spatialMotionRule).not.toContain('scaleY(')
    expect(objectMotionStyles).toContain('var(--workbench-object-motion-content-opacity)')
    expect(objectMotionStyles).not.toContain('transform-origin: top left;')
    expect(groupRule).toContain('background: transparent;')
    expect(materialRule).toContain('background: transparent;')
    expect(materialRule).not.toContain('opacity: var(--workbench-object-motion-content-opacity);')
    expect(materialRule).not.toContain('transform:')
    expect(materialFillRule).toContain('background: var(--cc-surface-translucent);')
    expect(collapsedMaterialFillRule).toContain('background: var(--terminal-group-surface);')
    expect(objectMotionStyles).toContain('width: var(--workbench-object-motion-shell-width);')
    expect(objectMotionStyles).toContain('height: var(--workbench-object-motion-shell-height);')
    expect(objectMotionStyles).toMatch(
      /translate3d\(\s*var\(--workbench-object-motion-shell-x\),\s*var\(--workbench-object-motion-shell-y\),\s*0\s*\)/
    )
    expect(objectMotionStyles).toContain('will-change: transform, width, height;')
    expect(expandingHeaderRule).toContain('width: var(--workbench-object-motion-shell-width);')
    expect(expandingHeaderRule).toContain('var(--workbench-object-motion-shell-x)')
    expect(expandingHeaderRule).toContain('var(--workbench-object-motion-shell-y)')
    expect(expandingHeaderRule).toContain('will-change: transform, width;')
    expect(expandingHeaderRule).toContain('overflow: hidden;')
    expect(expandingHeaderRule).toContain('transition: none;')
    expect(expandingHeaderRule).not.toContain('scale(')
    expect(objectMotionStyles).not.toContain('--workbench-object-motion-shell-inset')
    expect(objectMotionStyles).not.toContain('> .terminal-group-node__material::before')
    expect(objectMotionStyles).toContain('> .terminal-group-node__members--motion-exit')
    expect(objectMotionStyles).toContain(
      'opacity: calc(1 - var(--workbench-object-motion-content-opacity));'
    )
    expect(objectMotionStyles).toMatch(
      /workbench-object-motion--group-expand[\s\S]*> \.terminal-group-node__header[\s\S]*> :not\(\.terminal-group-node__title\)/
    )
    expect(terminalGroupStyles).not.toContain('.terminal-group-node__material--previous')
    expect(objectMotionStyles).not.toContain('--workbench-object-motion-previous-width')
    expect(objectMotionStyles).not.toContain('--workbench-object-motion-previous-height')
    expect(objectMotionStyles).not.toContain('@keyframes workbench-terminal-group-join')
    expect(objectMotionStyles).not.toContain('@keyframes workbench-terminal-group-reflow')
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

  it('keeps retained collapsed terminal surfaces out of interaction and paint', () => {
    const parkedRule = readStyleRule(terminalNodeStyles, '.terminal-node-anchor--parked')

    expect(parkedRule).toContain('visibility: hidden;')
    expect(parkedRule).toContain('pointer-events: none;')
  })

  it('uses no text or color decoration for group join, leave, or dissolve feedback', () => {
    const feedbackStyles = ['join', 'leave', 'dissolve']
      .map((feedback) => readTerminalGroupRule(`.terminal-group-node--drop-${feedback}`))
      .join('\n')

    expect(terminalGroupStyles).not.toContain('.terminal-group-node__drop-hint')
    expect(feedbackStyles).not.toContain('background:')
    expect(feedbackStyles).not.toContain('box-shadow:')
    expect(feedbackStyles).not.toMatch(/\b(border|color|outline):/)
    expect(feedbackStyles).not.toMatch(/--cc-(primary|warning|success)/)
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
      ':is(.terminal-node-anchor, .terminal-node, .terminal-group-node, .agent-console-node)'
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

  it('gives every canvas node shell one shared high corner radius', () => {
    const nodeRules = [
      readStyleRule(terminalNodeStyles, '.terminal-node'),
      readTerminalGroupRule('.terminal-group-node'),
      readStyleRule(agentConsoleStyles, '.agent-console-node')
    ]

    expect(themeStyles).toContain('--cc-canvas-node-radius: 20px;')
    nodeRules.forEach((rule) => {
      expect(rule).toContain('border-radius: var(--cc-canvas-node-radius);')
    })
    expect(
      normalizeWhitespace(readStyleRule(terminalNodeStyles, '.terminal-node__header'))
    ).toContain(
      'border-radius: calc(var(--cc-canvas-node-radius) - 1px) calc(var(--cc-canvas-node-radius) - 1px) 0 0;'
    )
    expect(normalizeWhitespace(readStyleRule(terminalNodeStyles, '.terminal-frame'))).toContain(
      'border-radius: 0 0 calc(var(--cc-canvas-node-radius) - 1px) calc(var(--cc-canvas-node-radius) - 1px);'
    )
    expect(readTerminalGroupRule('.terminal-group-node__header')).toContain(
      'border-radius: var(--cc-canvas-node-radius) var(--cc-canvas-node-radius) 0 0;'
    )
    expect(readTerminalGroupRule('.terminal-group-node__members')).toContain(
      'border-radius: 0 0 var(--cc-canvas-node-radius) var(--cc-canvas-node-radius);'
    )
    expect(readTerminalGroupRule('.terminal-group-node::after')).toContain(
      'border-radius: 0 0 var(--cc-canvas-node-radius) var(--cc-canvas-node-radius);'
    )
    expect(readStyleRule(agentConsoleStyles, '.agent-console')).toContain(
      'border-radius: calc(var(--cc-canvas-node-radius) - 1px);'
    )
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

function normalizeWhitespace(styles: string): string {
  return styles.replace(/\s+/g, ' ').trim()
}
