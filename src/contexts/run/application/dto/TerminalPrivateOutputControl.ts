/**
 * Provider-neutral launch metadata for output that must stay outside the authoritative terminal
 * model. The private environment is applied only by adapters that understand the protocol.
 */
export interface TerminalPrivateOutputControl {
  readonly protocol: 'osc-633-span-v1'
  readonly token: string
  readonly environment: Readonly<Record<string, string>>
}
