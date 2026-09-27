import { render, screen } from '@testing-library/react'
import { ProjectIssueDetails } from '../../../../src/contexts/project/presentation/components/ProjectIssueDetails'

it('renders issue prose as readable Markdown and keeps links on the web', () => {
  const issue = {
    id: 'I_1',
    repository: 'owner/repo',
    number: 1,
    title: 'Example',
    url: 'https://github.com/owner/repo/issues/1',
    state: 'OPEN' as const,
    labels: [],
    assignees: [],
    body: '## Steps\n\n- First step\n\n```sh\necho hello\n```\n\n[Docs](https://example.com/docs)\n\n[Related](../2)\n\n[Unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>'
  }
  const { container } = render(
    <ProjectIssueDetails
      issue={issue}
      detail={issue}
      loading={false}
      defaultBranch="main"
      busy={false}
      onStart={vi.fn()}
      onOpenWorkspace={vi.fn()}
    />
  )
  expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument()
  expect(screen.getByRole('listitem')).toHaveTextContent('First step')
  expect(container.querySelector('pre code')).toHaveTextContent('echo hello')
  expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'https://example.com/docs'
  )
  expect(screen.getByRole('link', { name: 'Related' })).toHaveAttribute(
    'href',
    'https://github.com/owner/repo/2'
  )
  expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()
  expect(container.querySelector('script')).toBeNull()
})
