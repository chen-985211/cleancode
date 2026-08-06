import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { CanvasObjectContextMenu } from '../../../src/presentation/app-shell/CanvasObjectContextMenu'

describe('Agent canvas object context menu', () => {
  it('uses the canonical canvas node menu template', () => {
    renderMenu({})

    const menu = screen.getByRole('menu', { name: 'Reviewer 操作' })
    expect(menu).toHaveClass('canvas-node-menu')
    expect(screen.getByRole('menuitem', { name: '重命名' })).toHaveClass('canvas-node-menu__item')
    expect(screen.getByRole('menuitem', { name: '移除' })).toHaveClass('canvas-node-menu__item')
    expect(screen.getByRole('menuitem', { name: '移除' })).not.toHaveClass(
      'canvas-node-menu__item--danger'
    )
    expect(menu.querySelector('.canvas-node-menu__separator')).not.toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: '重命名' }).querySelector('[data-icon-role="edit"]')
    ).toHaveAttribute('data-icon-glyph', 'pencil-simple')
    expect(
      screen.getByRole('menuitem', { name: '移除' }).querySelector('[data-icon-role="delete"]')
    ).toHaveAttribute('data-icon-glyph', 'trash')
  })

  it('renames the Agent through its existing action callback', async () => {
    const onClose = vi.fn()
    const onRename = vi.fn(async () => undefined)
    renderMenu({ onClose, onRename })

    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent 名称' }), {
      target: { value: 'Reviewer 2' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存 Agent 名称' }))

    await waitFor(() => expect(onRename).toHaveBeenCalledWith(reviewerAgent, 'Reviewer 2'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('removes the Agent through its existing action callback', async () => {
    const onClose = vi.fn()
    const onRemove = vi.fn(async () => undefined)
    renderMenu({ onClose, onRemove })

    fireEvent.click(screen.getByRole('menuitem', { name: '移除' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(reviewerAgent))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

function renderMenu({
  onClose = vi.fn(),
  onRemove = vi.fn(async () => undefined),
  onRename = vi.fn(async () => undefined)
}: {
  readonly onClose?: () => void
  readonly onRemove?: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename?: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
}): void {
  render(
    <CanvasObjectContextMenu
      agentActions={{ agent: reviewerAgent, onRemove, onRename }}
      position={{ x: 100, y: 100 }}
      target={{
        agentId: reviewerAgent.agentId,
        kind: 'agent',
        selectedConnectionIds: [],
        selectedNodeIds: [`agent:${reviewerAgent.agentId}`]
      }}
      onClose={onClose}
    />
  )
}

const reviewerAgent: WorkspaceAgentSnapshot = {
  agentId: 'reviewer',
  cleancodeMcpEnabled: true,
  layout: {
    position: { x: -480, y: 0 },
    size: { width: 420, height: 360 }
  },
  name: 'Reviewer',
  projectId: 'project-1',
  providerId: 'codex',
  workspaceId: 'main'
}
