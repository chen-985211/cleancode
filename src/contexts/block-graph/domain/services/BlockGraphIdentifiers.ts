export function createGraphId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `graph-${Date.now()}-${Math.random()}`
}

export function createBlockId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random()}`
}

export function createTerminalGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-group-${Date.now()}-${Math.random()}`
}

export function createTerminalConnectionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-connection-${Date.now()}-${Math.random()}`
}
