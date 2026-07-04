import { render, screen } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'

describe('app shell', () => {
  it('renders the cleancode workspace entry point', () => {
    render(<AppShell />)

    expect(screen.getByRole('main', { name: 'cleancode workspace' })).toBeInTheDocument()
    expect(screen.getByText('cleancode')).toBeInTheDocument()
  })
})
