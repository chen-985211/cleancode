import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { WorkspaceAgentSnapshot } from '../../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { AgentCanvasContextActions } from '../../../../src/contexts/agent/presentation/components/AgentCanvasContextActions'

describe('Agent canvas context actions', () => {
  it('publishes rename and remove intents through Agent callbacks', async () => {
    const onClose = vi.fn()
    const onModeChange = vi.fn()
    const onRemove = vi.fn(async () => undefined)
    const onRename = vi.fn(async () => undefined)
    const { rerender } = render(
      <AgentCanvasContextActions
        agent={agent}
        mode="actions"
        onClose={onClose}
        onModeChange={onModeChange}
        onRemove={onRemove}
        onRename={onRename}
      />
    )

    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onModeChange).toHaveBeenCalledWith('rename')

    rerender(
      <AgentCanvasContextActions
        agent={agent}
        mode="rename"
        onClose={onClose}
        onModeChange={onModeChange}
        onRemove={onRemove}
        onRename={onRename}
      />
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent 名称' }), {
      target: { value: ' Reviewer 2 ' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存 Agent 名称' }))

    await waitFor(() => expect(onRename).toHaveBeenCalledWith(agent, 'Reviewer 2'))
    expect(onClose).toHaveBeenCalledOnce()

    rerender(
      <AgentCanvasContextActions
        agent={agent}
        mode="actions"
        onClose={onClose}
        onModeChange={onModeChange}
        onRemove={onRemove}
        onRename={onRename}
      />
    )
    fireEvent.click(screen.getByRole('menuitem', { name: '移除' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(agent))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

const agent: WorkspaceAgentSnapshot = {
  agentId: 'reviewer',
  cleancodeMcpEnabled: true,
  layout: {
    position: { x: 0, y: 0 },
    size: { width: 420, height: 360 }
  },
  name: 'Reviewer',
  projectId: 'project-1',
  providerId: 'codex',
  workspaceId: 'main'
}
