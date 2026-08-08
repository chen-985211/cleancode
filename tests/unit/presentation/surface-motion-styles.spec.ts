import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const surfaceMotionStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/surface-motion.css'),
  'utf8'
)

describe('surface motion styles', () => {
  it('uses semantic timing for anchored enter, exit, and trigger-relative direction', () => {
    expect(surfaceMotionStyles).toContain('.anchored-surface-motion')
    expect(surfaceMotionStyles).toContain("[data-surface-motion-state='closing']")
    expect(surfaceMotionStyles).toContain("[data-side='top']")
    expect(surfaceMotionStyles).toContain('var(--cc-motion-duration-surface)')
    expect(surfaceMotionStyles).toContain('var(--cc-easing-enter)')
    expect(surfaceMotionStyles).toContain('var(--cc-easing-exit)')
  })

  it('coordinates overlay backdrops with drawer, dialog, and fullscreen content', () => {
    expect(surfaceMotionStyles).toContain('.overlay-surface-motion__content')
    expect(surfaceMotionStyles).toContain('.overlay-surface-motion--drawer-right')
    expect(surfaceMotionStyles).toContain('.overlay-surface-motion--dialog')
    expect(surfaceMotionStyles).toContain('.overlay-surface-motion--fullscreen')
  })
})
