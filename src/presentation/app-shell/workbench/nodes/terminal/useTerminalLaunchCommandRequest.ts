import { useCallback, useRef, useState } from 'react'

import type { WorkbenchSnapshot } from '../../../types/workbenchSnapshot'

interface UseTerminalLaunchCommandRequestInput {
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly focusTerminalBlock: (blockId: string) => void
}

export function useTerminalLaunchCommandRequest({
  currentWorkspace,
  focusTerminalBlock
}: UseTerminalLaunchCommandRequestInput) {
  const [request, setRequest] = useState<{
    readonly blockId: string
    readonly requestId: number
    readonly workspaceId: string
  } | null>(null)
  const requestIdRef = useRef(0)
  const requestTerminalLaunchCommand = useCallback(
    (blockId: string): void => {
      if (!currentWorkspace) return

      requestIdRef.current += 1
      setRequest({
        blockId,
        requestId: requestIdRef.current,
        workspaceId: currentWorkspace.workspaceId
      })
      focusTerminalBlock(blockId)
    },
    [currentWorkspace, focusTerminalBlock]
  )

  return { launchCommandEditRequest: request, requestTerminalLaunchCommand }
}
