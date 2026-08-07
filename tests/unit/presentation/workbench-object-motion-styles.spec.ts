import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const objectMotionStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workbench-object-motion.css'),
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
    expect(objectBaseRule).not.toContain('transform:')
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

  it('couples group-drop attraction with terminal settling and container acknowledgement', () => {
    const joinKeyframes = readRule('@keyframes workbench-terminal-group-join')
    const acceptKeyframes = readRule('@keyframes workbench-terminal-group-accept')

    expect(objectMotionStyles).toContain(
      '.canvas-surface--dragging-terminal:has(.terminal-group-node--drop-join)'
    )
    expect(objectMotionStyles).toContain('.terminal-group-node--drop-join::after')
    expect(objectMotionStyles).toContain(
      '.terminal-group-node--drop-join .workbench-node-selection-veil'
    )
    expect(joinKeyframes).toContain('var(--workbench-object-motion-x)')
    expect(joinKeyframes).toContain('scale(')
    expect(acceptKeyframes).toContain('scale(')
    expect(objectMotionStyles).toContain('.workbench-object-motion--group-join')
    expect(objectMotionStyles).toContain('.workbench-object-motion--group-accept')
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
