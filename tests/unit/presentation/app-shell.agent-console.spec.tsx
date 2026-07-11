import { render, screen, waitFor, within } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('app shell Agent console', () => {
  it('renders Codex as a dedicated canvas node instead of a terminal block', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    const canvas = screen.getByLabelText('积木画布')
    await waitFor(() =>
      expect(canvas.querySelector('[data-agent-console-node]')).toBeInTheDocument()
    )
    const agentConsole = canvas.querySelector('[data-agent-console-node]')

    expect(agentConsole).toHaveAttribute('aria-label', 'Codex Agent 控制台')
    expect(
      within(canvas).queryByRole('complementary', { name: 'Agent 面板' })
    ).not.toBeInTheDocument()
    expect(agentConsole).not.toHaveAttribute('data-terminal-block-id')
  })
})
