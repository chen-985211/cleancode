export interface LocalPortReservation {
  readonly host: '127.0.0.1'
  readonly port: number
  release(): Promise<void>
}

export interface LocalPortReservationPort {
  tryReserve(command: {
    readonly host: '127.0.0.1'
    readonly port?: number
  }): Promise<LocalPortReservation | null>
}
