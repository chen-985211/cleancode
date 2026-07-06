/// <reference types="vite/client" />

import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  CanvasViewportSnapshot,
  TerminalBlockSizeSnapshot
} from './contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from './contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from './contexts/project/application/dto/ProjectSnapshot'
import type { TerminalSessionSnapshot } from './contexts/run/application/dto/TerminalSessionSnapshot'
import type {
  TerminalExitEvent,
  TerminalOutputEvent
} from './contexts/run/application/ports/TerminalProcessPort'

interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

declare global {
  interface Window {
    cleancode?: {
      appName: 'cleancode'
      listWorkbenches(): Promise<WorkbenchSnapshot[]>
      addProject(): Promise<WorkbenchSnapshot | null>
      removeProject(command: { readonly projectDirectory: string }): Promise<WorkbenchSnapshot[]>
      createBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly branchName: string
      }): Promise<WorkbenchSnapshot>
      switchBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
      }): Promise<WorkbenchSnapshot>
      archiveBranchWorkspace(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
      }): Promise<WorkbenchSnapshot>
      checkoutMainWorkspaceBranch(command: {
        readonly projectDirectory: string
        readonly branchName: string
      }): Promise<WorkbenchSnapshot>
      createTerminalBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly name: string
        readonly description: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      updateTerminalBlockMetadata(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
        readonly name: string
        readonly description: string
      }): Promise<BlockGraphSnapshot>
      resizeTerminalBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
        readonly size: TerminalBlockSizeSnapshot
      }): Promise<BlockGraphSnapshot>
      updateGraphViewport(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly viewport: CanvasViewportSnapshot
      }): Promise<BlockGraphSnapshot>
      moveBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
        readonly position: BlockPositionSnapshot
      }): Promise<BlockGraphSnapshot>
      deleteBlock(command: {
        readonly projectDirectory: string
        readonly workspaceName: string
        readonly blockId: string
      }): Promise<BlockGraphSnapshot>
      saveGraph(command: {
        readonly projectDirectory: string
        readonly graph: BlockGraphSnapshot
      }): Promise<BlockGraphSnapshot>
      startTerminal(command: {
        readonly terminalBlockId: string
        readonly workspaceName: string
        readonly workingDirectory: string
        readonly shell?: string
        readonly columns?: number
        readonly rows?: number
      }): Promise<TerminalSessionSnapshot>
      writeTerminal(command: {
        readonly sessionId: string
        readonly input: string
      }): Promise<TerminalSessionSnapshot>
      resizeTerminal(command: {
        readonly sessionId: string
        readonly columns: number
        readonly rows: number
      }): Promise<void>
      interruptTerminal(command: { readonly sessionId: string }): Promise<TerminalSessionSnapshot>
      terminateTerminal(command: { readonly sessionId: string }): Promise<TerminalSessionSnapshot>
      onTerminalOutput(listener: (event: TerminalOutputEvent) => void): () => void
      onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void
    }
  }
}

export {}
