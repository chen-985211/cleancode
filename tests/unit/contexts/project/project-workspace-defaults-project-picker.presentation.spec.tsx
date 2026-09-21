import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { StrictMode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { WorkspaceDefaultsProjectPicker } from '../../../../src/contexts/project/presentation/components/WorkspaceDefaultsProjectPicker'
import { motionPreferenceStore } from '../../../../src/presentation/shared/motion/motionPreference'

describe('workspace defaults project picker', () => {
  const projects = [
    { id: 'first', name: 'Same name', directory: '/first/project' },
    { id: 'second', name: 'Same name', directory: '/second/project' }
  ]
  afterEach(() => vi.restoreAllMocks())

  it('keeps the selected project identity visible without the utility-button press motion', () => {
    render(
      <WorkspaceDefaultsProjectPicker
        projects={projects}
        selected={projects[0]}
        onSelect={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: '切换项目：Same name' })
    expect(within(trigger).getByText('Same name')).toBeInTheDocument()
    expect(within(trigger).getByText('/first/project')).toBeInTheDocument()

    fireEvent.pointerDown(trigger, { button: 0 })
    expect(trigger.style.getPropertyValue('--toolbar-utility-motion-scale')).toBe('')
    expect(trigger.style.getPropertyValue('--toolbar-utility-motion-y')).toBe('')
  })

  it.each([false, true])(
    'keeps project identities distinct and closes without leaking Escape (reduced motion: %s)',
    (reduced) => {
      vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(reduced)
      const select = vi.fn()
      const escape = vi.fn()
      render(
        <StrictMode>
          <div onKeyDown={escape}>
            <WorkspaceDefaultsProjectPicker
              projects={projects}
              selected={projects[1]}
              onSelect={select}
            />
          </div>
        </StrictMode>
      )
      const trigger = screen.getByRole('button', { name: '切换项目：Same name' })
      fireEvent.click(trigger)
      const options = screen.getAllByRole('menuitemradio')
      const menu = screen.getByRole('menu')
      expect(menu).toHaveAttribute('data-surface-spring-preset', 'directional-menu')
      expect(menu.querySelector('.menu-option-highlight-motion')).not.toBeNull()
      expect(options.every((option) => option.hasAttribute('data-menu-option-highlight'))).toBe(
        true
      )
      expect(options[0]).toHaveAccessibleDescription('/first/project')
      expect(options[1]).toHaveAccessibleDescription('/second/project')
      expect(menu).toHaveFocus()
      expect(options[1]).not.toHaveFocus()
      fireEvent.keyDown(menu, { key: 'Escape' })
      expect(escape).not.toHaveBeenCalled()
      expect(trigger).toHaveFocus()
      expect(select).not.toHaveBeenCalled()
      fireEvent.click(trigger)
      fireEvent.keyDown(document.activeElement!, { key: 'Home' })
      fireEvent.keyDown(document.activeElement!, { key: ' ' })
      expect(select).toHaveBeenCalledExactlyOnceWith('first')
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    }
  )

  it('lets an outside control take the same click without restoring focus to the project', () => {
    const outsideClick = vi.fn()
    const select = vi.fn()
    render(
      <>
        <WorkspaceDefaultsProjectPicker
          projects={projects}
          selected={projects[0]}
          onSelect={select}
        />
        <button onClick={outsideClick}>Outside</button>
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: '切换项目：Same name' }))
    const outside = screen.getByRole('button', { name: 'Outside' })
    outside.focus()
    fireEvent.pointerDown(outside, { button: 0 })
    fireEvent.click(outside)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(outside).toHaveFocus()
    expect(outsideClick).toHaveBeenCalledOnce()
    expect(select).not.toHaveBeenCalled()
  })

  it('matches the Agent menu by expressing selection with only the check', () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'src/contexts/project/presentation/components/WorkspaceDefaults.css'),
      'utf8'
    )
    const selectedRowRule =
      styles
        .split(".workspace-defaults-project-menu button[aria-checked='true'] {")[1]
        ?.split('}')[0] ?? ''

    const selectedNameRule =
      styles.match(
        /\.workspace-defaults-project-menu\s+button\[aria-checked='true'\]\s+\.workspace-defaults-project-copy\s+strong\s*\{([^}]*)\}/
      )?.[1] ?? ''
    const selectedCheckRule =
      styles
        .split(".workspace-defaults-project-menu button[aria-checked='true'] > svg:last-child {")[1]
        ?.split('}')[0] ?? ''

    expect(selectedRowRule).toBe('')
    expect(selectedNameRule).toBe('')
    expect(selectedCheckRule).toContain('color: var(--cc-primary);')
  })

  it('keeps the trigger hover quieter than the shared directional menu highlight', () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'src/contexts/project/presentation/components/WorkspaceDefaults.css'),
      'utf8'
    )
    const hoverRule =
      styles.match(
        /\.workspace-defaults-project-trigger\.directional-menu-trigger:hover:not\(:disabled\):not\(\s*\[aria-disabled='true'\]\s*\)\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(hoverRule).toContain('background: var(--cc-surface-hover);')
  })
})
