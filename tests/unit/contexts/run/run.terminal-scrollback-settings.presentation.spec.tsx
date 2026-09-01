import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'

import type { TerminalScrollbackRows } from '../../../../src/contexts/run/application/dto/TerminalRuntimeSettings'
import { TerminalScrollbackSettingsSection } from '../../../../src/contexts/run/presentation/components/TerminalScrollbackSettingsSection'

describe('terminal scrollback settings section', () => {
  it('projects the bounded Run preference options and publishes the selected budget', () => {
    render(<TerminalScrollbackSettingsHarness />)

    const options = screen.getByRole('radiogroup', { name: '滚动历史' })
    const selection = options.querySelector('.terminal-settings-options__selection')

    expect(selection).toHaveAttribute('data-selection-motion-target', '1000')
    expect(within(options).getAllByRole('radio')).toHaveLength(3)
    expect(within(options).getByRole('radio', { name: '5,000 行' })).not.toBeChecked()

    fireEvent.click(within(options).getByRole('radio', { name: '5,000 行' }))

    expect(within(options).getByRole('radio', { name: '5,000 行' })).toBeChecked()
    expect(selection).toHaveAttribute('data-selection-motion-target', '5000')
  })
})

function TerminalScrollbackSettingsHarness() {
  const [scrollbackRows, setScrollbackRows] = useState<TerminalScrollbackRows>(1000)

  return (
    <TerminalScrollbackSettingsSection
      scrollbackRows={scrollbackRows}
      onScrollbackChange={setScrollbackRows}
    />
  )
}
