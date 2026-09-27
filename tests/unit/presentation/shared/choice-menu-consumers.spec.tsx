import { motionPreferenceStore } from '../../../../src/presentation/shared/motion/motionPreference'
import { ChoiceSelect } from '../../../../src/presentation/shared/components/ChoiceSelect'
import { fireEvent, render, screen } from '@testing-library/react'
import { WorkspaceDefaultsProjectPicker } from '../../../../src/contexts/project/presentation/components/WorkspaceDefaultsProjectPicker'
import { WorkspaceDefaultsPicker } from '../../../../src/contexts/project/presentation/components/WorkspaceDefaultsPicker'
import { IssueMenuSelect } from '../../../../src/contexts/project/presentation/components/IssueMenuSelect'
import { LanguageSettingsRoot } from '../../../../src/presentation/app-shell/app-features/settings/LanguageSettingsRoot'
import { I18nProvider } from '../../../../src/presentation/i18n/I18nProvider'

const projects = [
  { id: 'one', name: 'One', directory: '/one' },
  { id: 'two', name: 'Two', directory: '/two' }
]
const cases = [
  [
    'form choice',
    () => (
      <ChoiceSelect
        label="Choose"
        value="two"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        onChange={vi.fn()}
      />
    )
  ],
  [
    'project',
    () => (
      <WorkspaceDefaultsProjectPicker
        projects={projects}
        selected={projects[1]}
        onSelect={vi.fn()}
      />
    )
  ],
  [
    'issue',
    () => (
      <IssueMenuSelect
        active
        label="Choose"
        value="two"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        onChange={vi.fn()}
      />
    )
  ],
  [
    'add',
    () => (
      <WorkspaceDefaultsPicker
        label="Choose"
        groups={[
          {
            name: 'Group',
            empty: 'Empty',
            choices: projects.map((p) => ({ ...p, selected: false }))
          }
        ]}
        onAdd={vi.fn()}
      />
    )
  ],
  [
    'language',
    () => (
      <I18nProvider initialLocale="zh-CN">
        <LanguageSettingsRoot />
      </I18nProvider>
    )
  ]
] as const

// One observable contract for every menu consumer, independent of its selected business value.
describe.each(cases)('%s choice menu', (_name, view) => {
  afterEach(() => vi.restoreAllMocks())
  it.each([false, true])(
    'separates hover, focus and selected state (reduced motion: %s)',
    (reduced) => {
      vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(reduced)
      render(
        <>
          {view()}
          <button>Outside</button>
        </>
      )
      const trigger = screen.getAllByRole('button')[0]
      fireEvent.click(trigger)
      const menu = screen.getByRole('menu')
      const highlight = menu.querySelector('.menu-option-highlight-motion')!
      expect(menu).toHaveFocus()
      expect(highlight).not.toBeNull()
      expect(highlight).not.toHaveAttribute('data-visible', 'true')
      const items = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]')
      )
      fireEvent.pointerOver(items[1])
      expect(highlight).toHaveAttribute('data-visible', 'true')
      fireEvent.pointerLeave(menu)
      expect(highlight).not.toHaveAttribute('data-visible', 'true')
      fireEvent.keyDown(menu, { key: 'ArrowUp' })
      expect(items[1]).toHaveFocus()
      expect(highlight).toHaveAttribute('data-visible', 'true')
      screen.getByRole('button', { name: 'Outside' }).focus()
      expect(highlight).not.toHaveAttribute('data-visible', 'true')
      fireEvent.keyDown(menu, { key: 'Escape' })
      expect(trigger).toHaveFocus()
      fireEvent.click(trigger)
      expect(screen.getByRole('menu')).toHaveFocus()
      expect(highlight).not.toHaveAttribute('data-visible', 'true')
    }
  )
  it('opens from the keyboard at the requested boundary', () => {
    render(view())
    const trigger = screen.getAllByRole('button')[0]
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    const menu = screen.getByRole('menu')
    expect(menu.lastElementChild?.contains(document.activeElement)).toBe(true)
  })
  it.each([false, true])(
    'returns Tab navigation to the parent after restoring the trigger (reverse: %s)',
    (shiftKey) => {
      const parentKeyDown = vi.fn((event) => {
        expect(event.key).toBe('Tab')
        expect(event.shiftKey).toBe(shiftKey)
        expect(event.defaultPrevented).toBe(false)
        expect(trigger).toHaveFocus()
      })
      render(<div onKeyDown={parentKeyDown}>{view()}</div>)
      const trigger = screen.getAllByRole('button')[0]
      fireEvent.click(trigger)
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab', shiftKey })
      expect(parentKeyDown).toHaveBeenCalledOnce()
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    }
  )
})
