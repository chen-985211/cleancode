import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TerminalMetadataForm } from '../../../src/presentation/app-shell/TerminalMetadataForm'
import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

describe('terminal workflow advanced configuration', () => {
  it('saves literal-output service readiness together with terminal metadata', async () => {
    const onSave = vi.fn(async () => undefined)
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={onSave}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('运行模式'), { target: { value: 'service' } })
    fireEvent.change(screen.getByLabelText('服务就绪文本'), {
      target: { value: ' API ready ' }
    })
    fireEvent.change(screen.getByLabelText('服务就绪超时'), { target: { value: '45' } })
    fireEvent.click(screen.getByLabelText('保存终端信息'))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ launchCommand: 'pnpm dev' }), {
        mode: 'service',
        readiness: { type: 'output', text: 'API ready' },
        readinessTimeoutMs: 45_000
      })
    )
  })

  it('does not save an invalid task timeout', () => {
    const onSave = vi.fn(async () => undefined)
    render(
      <TerminalMetadataForm
        block={createBlock()}
        shouldFocusLaunchCommand={false}
        onSave={onSave}
        onCancel={() => undefined}
      />
    )

    fireEvent.change(screen.getByLabelText('任务超时'), { target: { value: '0' } })

    expect(screen.getByLabelText('保存终端信息')).toBeDisabled()
  })
})

function createBlock(): TerminalBlockSnapshot {
  return {
    id: 'api',
    type: 'terminal',
    name: 'API',
    description: 'API service',
    launchCommand: 'pnpm dev',
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
    position: { x: 0, y: 0 },
    size: { width: 560, height: 360 }
  }
}
