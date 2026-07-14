import type { MutableRefObject } from 'react'

export function AgentTerminalSurface({
  activeOutput,
  terminalElementRef,
  onFallbackInput,
  useFallback
}: {
  readonly activeOutput: string
  readonly terminalElementRef: MutableRefObject<HTMLDivElement | null>
  readonly onFallbackInput: (input: string) => void
  readonly useFallback: boolean
}) {
  if (useFallback) {
    return (
      <div className="agent-terminal-fallback">
        <pre aria-label="Codex CLI 终端">{activeOutput}</pre>
        <textarea
          aria-label="Codex CLI 输入"
          onChange={(event) => {
            onFallbackInput(event.target.value)
            event.target.value = ''
          }}
        />
      </div>
    )
  }

  return (
    <div className="agent-terminal-frame nodrag nopan nowheel">
      <div className="agent-terminal-viewport nodrag nopan nowheel" ref={terminalElementRef} />
    </div>
  )
}
