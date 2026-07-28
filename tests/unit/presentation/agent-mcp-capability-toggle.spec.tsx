import { fireEvent, render, screen } from '@testing-library/react'

import { AgentMcpCapabilityToggle } from '../../../src/presentation/app-shell/AgentMcpCapabilityToggle'

describe('Agent CleanCode MCP capability toggle', () => {
  it('shows the named MCP capability as an accessible switch with complete scope guidance', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <AgentMcpCapabilityToggle enabled onChange={onChange} pending={false} />
    )

    const toggle = screen.getByRole('switch', { name: 'CleanCode MCP' })
    const icon = container.querySelector('.agent-mcp-capability__icon')

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('CleanCode MCP')).toBeInTheDocument()
    expect(icon).toHaveAttribute('viewBox', '0 0 195 195')
    expect(icon).toHaveAttribute('stroke', 'currentColor')
    expect(icon?.querySelectorAll('path')).toHaveLength(3)
    expect(icon?.querySelector('circle')).toBeNull()
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(toggle)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('画布')
    expect(tooltip).toHaveTextContent('执行配置')
    expect(tooltip).toHaveTextContent('依赖工作流')
    expect(tooltip).toHaveTextContent('sandbox')
    expect(tooltip).toHaveTextContent('断开依赖')

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

  it.each(['degraded', 'unavailable'] as const)(
    'offers a separate reconnect action when an enabled MCP is %s',
    (status) => {
      const onChange = vi.fn()
      const onReconnect = vi.fn()
      render(
        <AgentMcpCapabilityToggle
          enabled
          onChange={onChange}
          onReconnect={onReconnect}
          pending={false}
          status={status}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '重新连接 CleanCode MCP' }))
      expect(onReconnect).toHaveBeenCalledOnce()
      expect(onChange).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['ready', 'ready'],
    ['initializing', 'connecting'],
    ['degraded', 'degraded'],
    ['failed', 'unavailable']
  ] as const)('shows the %s runtime as a %s status dot', (_runtimeStatus, status) => {
    const { container } = render(
      <AgentMcpCapabilityToggle enabled onChange={vi.fn()} pending={false} status={status} />
    )

    expect(container.querySelector('.agent-mcp-capability__status-dot')).toHaveAttribute(
      'data-state',
      status
    )
  })

  it.each([
    ['disabled', 'ready'],
    ['unsupported', null]
  ] as const)(
    'keeps the MCP status dot hidden when runtime status is %s',
    (_runtimeStatus, status) => {
      const { container } = render(
        <AgentMcpCapabilityToggle
          enabled={false}
          onChange={vi.fn()}
          pending={false}
          status={status}
        />
      )

      expect(container.querySelector('.agent-mcp-capability__status-dot')).toBeNull()
    }
  )
})
