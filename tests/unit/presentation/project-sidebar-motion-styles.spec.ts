import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const shellStyles = readStyle('base.css')
const sidebarStyles = readStyle('project-sidebar.css')

describe('project sidebar motion styles', () => {
  it('lets the spring owner coordinate the workspace track and complete sidebar surface', () => {
    expect(shellStyles).toContain('--cc-sidebar-expanded-width: 280px;')
    expect(shellStyles).toContain('--cc-sidebar-motion-width: var(--cc-sidebar-expanded-width);')
    expect(shellStyles).toContain(
      'grid-template-columns: var(--cc-sidebar-motion-width) minmax(440px, 1fr);'
    )
    expect(shellStyles).not.toContain('transition: grid-template-columns')
    expect(sidebarStyles).toContain(
      'transform: translate3d(var(--cc-sidebar-motion-offset), 0, 0);'
    )
    expect(readRule(sidebarStyles, '.project-sidebar__motion-surface')).not.toContain(
      'transition: transform'
    )
  })

  it('keeps the surface geometry stable while entering and exiting along the sidebar edge', () => {
    const sidebarRule = readRule(sidebarStyles, '.project-sidebar')
    const expandedRule = readRule(sidebarStyles, '.project-sidebar__motion-surface')
    const collapsedSidebarRule = readRule(
      sidebarStyles,
      ".app-shell[data-project-sidebar-motion-state='collapsed'] .project-sidebar"
    )

    expect(sidebarRule).toContain('width: 100%;')
    expect(expandedRule).toContain('width: var(--cc-sidebar-expanded-width);')
    expect(expandedRule).toContain('background: var(--cc-chrome);')
    expect(expandedRule).toContain('transform: translate3d(var(--cc-sidebar-motion-offset), 0, 0);')
    expect(collapsedSidebarRule).toContain('visibility: hidden;')
    expect(expandedRule).not.toContain('padding-left: 0;')
    expect(expandedRule).not.toContain('padding-right: 0;')
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
