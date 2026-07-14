export interface WaitForTcpReadinessCommand {
  readonly port: number
  readonly signal: AbortSignal
}

export interface TcpReadinessPort {
  waitUntilReady(command: WaitForTcpReadinessCommand): Promise<void>
}
