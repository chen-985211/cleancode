import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { TerminalSettingsPane } from '../../../src/presentation/app-shell/app-features/settings/TerminalSettingsPane'
import type { TerminalScrollbackRows } from '../../../src/contexts/run/application/dto/TerminalRuntimeSettings'

function Harness() {
  const [rows, setRows] = useState<TerminalScrollbackRows>(1000)
  return (
    <TerminalSettingsPane
      scrollbackRows={rows}
      onScrollbackChange={setRows}
      terminalWorkflowBuildMode="progressive"
      onTerminalWorkflowBuildModeChange={() => undefined}
    />
  )
}

describe('terminal segmented settings', () => {
  it('uses section headings and text-only radio controls', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: '终端', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '滚动历史', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '终端搭建动效', level: 3 })).toBeInTheDocument()
    expect(document.querySelector('input[type="radio"]')).toBeNull()
  })

  it('supports arrow keys, Home and End with selection and focus in agreement', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: '滚动历史' })
    const choices = within(group).getAllByRole('radio')
    choices[0].focus()
    fireEvent.keyDown(choices[0], { key: 'ArrowRight' })
    expect(choices[1]).toBeChecked()
    expect(choices[1]).toHaveFocus()
    fireEvent.keyDown(choices[1], { key: 'End' })
    expect(choices[2]).toBeChecked()
    fireEvent.keyDown(choices[2], { key: 'Home' })
    expect(choices[0]).toBeChecked()
    expect(choices.filter((choice) => choice.tabIndex === 0)).toEqual([choices[0]])
  })
})

it('lets Escape reach the settings surface when no drag is active', () => {
  const escape = vi.fn()
  render(
    <div onKeyDown={escape}>
      <Harness />
    </div>
  )
  fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'Escape' })
  expect(escape).toHaveBeenCalledOnce()
})
