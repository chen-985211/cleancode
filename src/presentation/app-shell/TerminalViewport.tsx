import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  TerminalRuntimeViewport,
  type TerminalRuntimeViewportProps
} from '../../contexts/run/presentation/components/TerminalRuntimeViewport'
import type {
  TerminalDimensions,
  TerminalViewState
} from '../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { TerminalRunIdentity } from '../../contexts/run/application/dto/TerminalRunEvent'

interface TerminalViewportProps {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly focusRequestId: number
  readonly isResizeSuspended?: boolean
  readonly isInputDisabled?: boolean
  readonly onViewIdentityStale?: (identity: TerminalRunIdentity) => void
  readonly onRestart: () => void
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onPaste?: (block: TerminalBlockSnapshot, input: string) => Promise<void>
}

export function TerminalViewport({
  block,
  onInput,
  onPaste,
  ...viewportProps
}: TerminalViewportProps) {
  const runViewportProps: TerminalRuntimeViewportProps = {
    ...viewportProps,
    blockName: block.name,
    onInput: (input) => onInput(block, input),
    onPaste: onPaste ? (input) => onPaste(block, input) : undefined
  }

  return <TerminalRuntimeViewport {...runViewportProps} />
}
