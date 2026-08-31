export type AgentAttachMode = 'initial' | 'new' | 'retry'

export type AgentAttachOperation =
  | { readonly status: 'idle' }
  | { readonly status: 'measuring' }
  | { readonly mode: AgentAttachMode; readonly status: 'pending' }
  | { readonly mode: AgentAttachMode; readonly status: 'failed' }
