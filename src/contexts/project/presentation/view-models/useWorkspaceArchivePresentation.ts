import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectWorkbenchViewModel } from './ProjectWorkbenchViewModel'

type Workspace = ProjectWorkbenchViewModel['project']['workspaces'][number]

interface PresentedWorkspace {
  readonly workspace: Workspace
  readonly present: boolean
}

export function useWorkspaceArchivePresentation(workspaces: readonly Workspace[]) {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const pendingRef = useRef(new Set<string>())
  const mounted = useRef(true)
  const [rendered, setRendered] = useState(() => ({
    source: workspaces,
    rows: workspaces.map((workspace): PresentedWorkspace => ({ workspace, present: true }))
  }))
  let rows = rendered.rows
  if (rendered.source !== workspaces) {
    const current = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]))
    rows = workspaces.map((workspace) => ({ workspace, present: true }))
    rendered.rows.forEach((row, index) => {
      if (!current.has(row.workspace.workspaceId)) {
        rows.splice(Math.min(index, rows.length), 0, { ...row, present: false })
      }
    })
    setRendered({ source: workspaces, rows })
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const archive = useCallback((workspaceId: string, operation: () => void | Promise<void>) => {
    if (pendingRef.current.has(workspaceId)) return
    pendingRef.current.add(workspaceId)
    setPending(new Set(pendingRef.current))
    const settled = (): void => {
      pendingRef.current.delete(workspaceId)
      if (mounted.current) setPending(new Set(pendingRef.current))
    }
    // The action owner publishes errors. Only the authoritative workspace list can
    // retire a row; neither a fulfilled nor a rejected callback invents that fact.
    try {
      void Promise.resolve(operation()).then(settled, settled)
    } catch {
      settled()
    }
  }, [])

  const completeExit = useCallback((workspaceId: string) => {
    setRendered((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.present || row.workspace.workspaceId !== workspaceId)
    }))
  }, [])

  return { archive, completeExit, pending, rows }
}
