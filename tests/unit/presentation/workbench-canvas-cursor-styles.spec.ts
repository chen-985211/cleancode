import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const canvasStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workbench-canvas.css'),
  'utf8'
)
const templateStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/block-template-canvas.css'),
  'utf8'
)
const cursorAssetPath = resolve(
  process.cwd(),
  'src/presentation/app-shell/assets/canvas-pointer.svg'
)

describe('workbench canvas cursor styles', () => {
  it('uses one native cursor token for the pane and draggable canvas objects', () => {
    expect(canvasStyles).toMatch(
      /--cc-canvas-pointer:\s*url\([^)]*canvas-pointer\.svg[^)]*\)\s+\d+\s+\d+,\s*default;/
    )
    expect(canvasStyles).toContain('.react-flow__pane')
    expect(canvasStyles).toContain('.react-flow__pane.selection')
    expect(canvasStyles).toContain('.react-flow__node')
    expect(canvasStyles).toContain('.react-flow__node.draggable.dragging')
    expect(canvasStyles).toContain('.react-flow__nodesselection-rect')
    expect(canvasStyles).toContain('.terminal-node__header')
    expect(canvasStyles).toContain('.terminal-group-node__header')
    expect(canvasStyles).toContain('.agent-console__header')
    expect(canvasStyles).toContain('cursor: var(--cc-canvas-pointer);')
    expect(readRule('.react-flow__pane.draggable')).not.toContain('cursor: grab')
    expect(readRule('.react-flow__pane.dragging')).not.toContain('cursor: grabbing')
    const coreCursorStyles = canvasStyles.slice(
      canvasStyles.indexOf('.react-flow__pane'),
      canvasStyles.indexOf('.canvas-minimap-panel')
    )
    expect(coreCursorStyles).not.toMatch(/cursor:\s*grab(bing)?/)
    expect(coreCursorStyles).not.toContain('.react-flow__handle')
    expect(coreCursorStyles).not.toContain('.react-flow__resize-control')
    expect(coreCursorStyles).not.toContain('.xterm')
    expect(coreCursorStyles).not.toMatch(/\bbutton\b/)
  })

  it('keeps template placement on the same cursor instead of switching to a crosshair', () => {
    const placementRule = readRule('.canvas-surface--placing-template', templateStyles)

    expect(placementRule).toContain('cursor: var(--cc-canvas-pointer);')
    expect(placementRule).not.toContain('crosshair')
  })

  it('ships a compact 20px static vector cursor without a DOM-following animation', () => {
    expect(existsSync(cursorAssetPath)).toBe(true)
    const cursorAsset = existsSync(cursorAssetPath) ? readFileSync(cursorAssetPath, 'utf8') : ''

    expect(cursorAsset).toContain('<svg')
    expect(cursorAsset).toContain('width="20" height="20" viewBox="0 0 24 24"')
    expect(cursorAsset).not.toContain('<animate')
  })

  it('uses the compact tailless Spatial paper-plane silhouette', () => {
    const cursorAsset = readFileSync(cursorAssetPath, 'utf8')

    expect(cursorAsset).toContain(
      'd="M3.25 2.9 20.8 9.15c1.05.37 1.08 1.82.05 2.24l-6.48 2.62-2.3 6.55c-.36 1.04-1.8 1.09-2.23.08L2.92 4.91C2.47 3.87 2.2 2.53 3.25 2.9Z"'
    )
    expect(cursorAsset).toContain('stroke-width="1.15"')
    expect(cursorAsset).not.toContain('<filter')
  })
})

function readRule(selector: string, styles = canvasStyles): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
