import { act, render } from '@testing-library/react'

import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalRuntimeViewportProps } from '../../../src/contexts/run/presentation/components/TerminalRuntimeViewport'
import { TerminalViewport } from '../../../src/presentation/app-shell/TerminalViewport'

const viewportMockState = vi.hoisted(() => ({
  props: null as TerminalRuntimeViewportProps | null
}))

vi.mock('../../../src/contexts/run/presentation/components/TerminalRuntimeViewport', () => ({
  TerminalRuntimeViewport: (props: TerminalRuntimeViewportProps) => {
    viewportMockState.props = props
    return <div data-testid="terminal-runtime-viewport" />
  }
}))

describe('terminal viewport App Shell adapter', () => {
  beforeEach(() => {
    viewportMockState.props = null
  })

  it('narrows BlockGraph metadata and restores block-scoped callbacks around the Run viewport', async () => {
    const block = createTerminalBlock()
    const session = {
      output: '',
      sessionId: 'terminal-session-1',
      status: 'running' as const
    }
    const onInput = vi.fn()
    const onPaste = vi.fn(async () => undefined)

    const workspace = render(
      <TerminalViewport
        block={block}
        session={session}
        focusRequestId={3}
        isInputDisabled
        isResizeSuspended
        onDimensionsChange={vi.fn()}
        onInput={onInput}
        onPaste={onPaste}
        onRestart={vi.fn()}
      />
    )

    expect(workspace.getByTestId('terminal-runtime-viewport')).toBeInTheDocument()
    expect(viewportMockState.props).toMatchObject({
      blockName: 'Terminal 1',
      focusRequestId: 3,
      isInputDisabled: true,
      isResizeSuspended: true,
      session
    })

    act(() => viewportMockState.props?.onInput('pwd\r'))
    await act(async () => viewportMockState.props?.onPaste?.('echo hello\r'))

    expect(onInput).toHaveBeenCalledWith(block, 'pwd\r')
    expect(onPaste).toHaveBeenCalledWith(block, 'echo hello\r')
  })
})

function createTerminalBlock(): TerminalBlockSnapshot {
  return {
    description: '本地终端',
    id: 'terminal-1',
    launchCommand: '',
    name: 'Terminal 1',
    position: { x: 120, y: 80 },
    size: { height: 360, width: 640 },
    type: 'terminal'
  }
}
