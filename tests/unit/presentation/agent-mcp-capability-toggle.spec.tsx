import { fireEvent, render, screen } from '@testing-library/react'

import { AgentMcpCapabilityToggle } from '../../../src/presentation/app-shell/AgentMcpCapabilityToggle'

describe('Agent CleanCode MCP capability toggle', () => {
  it('shows the named MCP capability as an accessible switch with complete scope guidance', () => {
    const onChange = vi.fn()
    const { container } = render(
      <AgentMcpCapabilityToggle enabled onChange={onChange} pending={false} />
    )

    const toggle = screen.getByRole('switch', { name: 'CleanCode MCP' })
    const tooltip = toggle.closest('[data-cc-tooltip]')
    const icon = container.querySelector('.agent-mcp-capability__icon')

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('CleanCode MCP')).toBeInTheDocument()
    expect(icon).toHaveAttribute('viewBox', '0 0 195 195')
    expect(icon).toHaveAttribute('stroke', 'currentColor')
    expect(icon?.querySelectorAll('path')).toHaveLength(3)
    expect(icon?.querySelector('circle')).toBeNull()
    expect(tooltip).toHaveAttribute('data-cc-tooltip', expect.stringContaining('画布'))
    expect(tooltip).toHaveAttribute('data-cc-tooltip', expect.stringContaining('sandbox'))
    expect(tooltip).toHaveAttribute('data-cc-tooltip', expect.stringContaining('删除'))

    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('prevents duplicate switching while the Agent runtime is restarting', () => {
    const onChange = vi.fn()
    render(<AgentMcpCapabilityToggle enabled onChange={onChange} pending />)

    const toggle = screen.getByRole('switch', { name: 'CleanCode MCP' })
    expect(toggle).toBeDisabled()
    fireEvent.click(toggle)
    expect(onChange).not.toHaveBeenCalled()
  })
})
