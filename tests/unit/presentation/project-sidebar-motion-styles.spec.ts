import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const shellStyles = readStyle('base.css')
const sidebarStyles = readStyle('project-sidebar.css')
const titlebarStyles = readStyle('project-sidebar-titlebar.css')
const canvasStyles = readStyle('workbench-canvas.css')

describe('project sidebar motion styles', () => {
  it('keeps the application layout stable while motion is running on compositor surfaces', () => {
    const shellRule = readRule(shellStyles, '.app-shell')
    const sidebarColumnRule = readRule(sidebarStyles, '.project-sidebar-column')
    const spatialRule = readRule(canvasStyles, '.workbench-canvas__spatial-motion-surface')
    const expandedSpatialRule = readRule(
      canvasStyles,
      ".workbench-canvas__spatial-motion-surface[data-project-sidebar-motion-state='expanded']"
    )
    const centerRule = readRule(canvasStyles, '.workbench-canvas__center-motion-surface')
    const expandedCenterRule = readRule(
      canvasStyles,
      ".workbench-canvas__center-motion-surface[data-project-sidebar-motion-state='expanded']"
    )
    const canvasSurfaceRule = readRule(canvasStyles, '.canvas-surface')

    expect(shellRule).toContain('--cc-sidebar-expanded-width: 280px;')
    expect(shellRule).toContain('grid-template-columns: minmax(0, 1fr);')
    expect(shellRule).not.toContain('--cc-sidebar-motion-width')
    expect(sidebarColumnRule).toContain('position: absolute;')
    expect(sidebarColumnRule).toContain('width: var(--cc-sidebar-expanded-width);')
    expect(spatialRule).toContain('position: absolute;')
    expect(spatialRule).toContain('inset: 0;')
    expect(expandedSpatialRule).toContain('left: var(--cc-sidebar-expanded-width);')
    expect(expandedSpatialRule).toContain('right: 0;')
    expect(centerRule).toContain('position: absolute;')
    expect(centerRule).toContain('inset: 0;')
    expect(expandedCenterRule).toContain('left: var(--cc-sidebar-expanded-width);')
    expect(expandedCenterRule).toContain('right: 0;')
    expect(canvasSurfaceRule).toContain('overflow: clip;')
    expect(shellStyles).not.toContain('transition: grid-template-columns')
  })

  it('keeps all spring-owned transforms free from competing CSS transitions', () => {
    const sidebarRule = readRule(sidebarStyles, '.project-sidebar__motion-surface')
    const spatialRule = readRule(canvasStyles, '.workbench-canvas__spatial-motion-surface')
    const centerRule = readRule(canvasStyles, '.workbench-canvas__center-motion-surface')

    expect(sidebarRule).toContain('width: var(--cc-sidebar-expanded-width);')
    expect(sidebarRule).toContain('background: var(--cc-chrome);')
    expect(sidebarRule).not.toContain('transition: transform')
    expect(spatialRule).not.toContain('transition: transform')
    expect(centerRule).not.toContain('transition: transform')
  })

  it('separates the projects heading and add action across the full row', () => {
    const sectionHeaderRule = readRule(sidebarStyles, '.project-sidebar__section-header')
    const addProjectRule = readRule(sidebarStyles, '.project-sidebar__add')

    expect(sectionHeaderRule).toContain('display: flex;')
    expect(sectionHeaderRule).toContain('align-items: center;')
    expect(sectionHeaderRule).toContain('justify-content: space-between;')
    expect(sectionHeaderRule).not.toContain('width: fit-content;')
    expect(addProjectRule).toContain('color: var(--cc-muted);')
  })

  it('moves the titlebar material with the sidebar while keeping its toggle stationary', () => {
    const navigationRule = readRule(titlebarStyles, '.app-shell__titlebar-navigation')
    const collapsedNavigationRule = readRule(
      titlebarStyles,
      '.app-shell--sidebar-collapsed .app-shell__titlebar-navigation'
    )
    const titlebarSurfaceRule = readRule(titlebarStyles, '.app-shell__titlebar-navigation-surface')
    const collapsedTitlebarSurfaceRule = readRule(
      titlebarStyles,
      ".app-shell__titlebar-navigation-surface[data-project-sidebar-motion-state='collapsed']"
    )
    const toggleRule = readRule(titlebarStyles, '.project-sidebar-toggle')

    expect(navigationRule).toContain('position: relative;')
    expect(navigationRule).toContain('flex: 0 0 var(--cc-titlebar-height);')
    expect(navigationRule).toContain('overflow: visible;')
    expect(navigationRule).toContain('background: transparent;')
    expect(navigationRule).not.toContain('will-change: transform;')
    expect(titlebarSurfaceRule).toContain('width: var(--cc-sidebar-expanded-width);')
    expect(titlebarSurfaceRule).toContain('z-index: 0;')
    expect(titlebarSurfaceRule).toContain('background: var(--cc-chrome);')
    expect(titlebarSurfaceRule).toContain('box-shadow: inset -1px 0 var(--cc-divider);')
    expect(collapsedTitlebarSurfaceRule).toContain('visibility: hidden;')
    expect(collapsedTitlebarSurfaceRule).toContain(
      'transform: translate3d(calc(-1 * var(--cc-sidebar-expanded-width)), 0, 0);'
    )
    expect(collapsedNavigationRule).toContain('width: max-content;')
    expect(collapsedNavigationRule).not.toContain('position: absolute;')
    expect(toggleRule).toContain('position: relative;')
    expect(toggleRule).toContain('z-index: 1;')
  })
})

function readStyle(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'src/presentation/app-shell/styles', fileName), 'utf8')
}

function readRule(styles: string, selector: string): string {
  const ruleStart = styles.indexOf(`${selector} {`)
  if (ruleStart < 0) return ''
  const ruleEnd = styles.indexOf('}', ruleStart)
  return ruleEnd < 0 ? '' : styles.slice(ruleStart, ruleEnd)
}
