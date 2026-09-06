import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { WorkspaceDefaultsProjectPicker } from '../../../../src/contexts/project/presentation/components/WorkspaceDefaultsProjectPicker'
import { motionPreferenceStore } from '../../../../src/presentation/shared/motion/motionPreference'

describe('workspace defaults project picker', () => {
  const projects = [
    { id: 'first', name: 'Same name', directory: '/first/project' },
    { id: 'second', name: 'Same name', directory: '/second/project' }
  ]
  afterEach(() => vi.restoreAllMocks())

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
      expect(options[0]).toHaveAccessibleDescription('/first/project')
      expect(options[1]).toHaveAccessibleDescription('/second/project')
      expect(options[1]).toHaveFocus()
      fireEvent.keyDown(options[1], { key: 'Escape' })
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
})
