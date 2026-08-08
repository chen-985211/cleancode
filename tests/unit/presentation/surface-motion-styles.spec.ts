import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const surfaceMotionStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/surface-motion.css'),
  'utf8'
)
const languageSettingsStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/language-settings.css'),
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

  it('projects JavaScript spring surfaces without a competing CSS transition', () => {
    expect(surfaceMotionStyles).toContain('.anchored-surface-motion[data-surface-spring-preset]')
    expect(surfaceMotionStyles).toContain(
      ".anchored-surface-motion[data-surface-spring-preset='anchored-top-right']"
    )
    expect(surfaceMotionStyles).toContain(
      '.overlay-surface-motion[data-surface-spring-preset][data-surface-motion-state]\n  .overlay-surface-motion__content'
    )
    expect(surfaceMotionStyles).toContain('var(--cc-surface-motion-translate-x, 0)')
    expect(surfaceMotionStyles).toContain('transition: none')
  })

  it('keeps spring presentation authoritative throughout opening and closing states', () => {
    expect(surfaceMotionStyles).toContain(
      '.overlay-surface-motion[data-surface-spring-preset][data-surface-motion-state]'
    )
    expect(surfaceMotionStyles).toContain(
      '.overlay-surface-motion[data-surface-spring-preset][data-surface-motion-state]\n  .overlay-surface-motion__content'
    )
    expect(surfaceMotionStyles).toContain(
      '.overlay-surface-motion--fullscreen[data-surface-spring-preset][data-surface-motion-state]'
    )
  })

  it('scales the anchored menu material without resampling its text content', () => {
    const anchoredTopRightRule = readRule(
      surfaceMotionStyles,
      ".anchored-surface-motion[data-surface-spring-preset='anchored-top-right']"
    )
    const languageMaterialRule = readRule(
      languageSettingsStyles,
      ".language-settings-menu[data-surface-spring-preset='anchored-top-right']::before"
    )

    expect(anchoredTopRightRule).toContain('var(--cc-surface-motion-translate-x, 0)')
    expect(anchoredTopRightRule).not.toContain('scale(')
    expect(languageMaterialRule).toContain('scale(var(--cc-surface-motion-scale, 1))')
    expect(languageMaterialRule).toContain('will-change: transform;')
  })
})

function readRule(styles: string, selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
