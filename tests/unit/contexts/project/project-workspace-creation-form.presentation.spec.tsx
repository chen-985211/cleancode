import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useProjectSidebarBranchWorkspaceForm } from '../../../../src/contexts/project/presentation/view-models/useProjectSidebarBranchWorkspaceForm'

describe('workspace creation submission', () => {
  it('retains the branch on failure, prevents duplicate submission, and closes after success', async () => {
    let finish: (value: boolean) => void = () => undefined
    const submit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    function Form() {
      const form = useProjectSidebarBranchWorkspaceForm(submit)
      return (
        <>
          <button onClick={form.open}>Open</button>
          {form.isOpen ? (
            <form onSubmit={form.submit}>
              <input
                aria-label="Branch"
                value={form.branchName}
                onChange={(event) => form.setBranchName(event.target.value)}
              />
              <button type="submit">Create</button>
            </form>
          ) : null}
        </>
      )
    }
    render(<Form />)
    fireEvent.click(screen.getByText('Open'))
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'feature/defaults' } })
    fireEvent.click(screen.getByText('Create'))
    fireEvent.click(screen.getByText('Create'))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    await act(async () => finish(false))
    expect(screen.getByLabelText('Branch')).toHaveValue('feature/defaults')
    fireEvent.click(screen.getByText('Create'))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    await act(async () => finish(true))
    await waitFor(() => expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument())
  })
})
