import { useCallback, useRef, useState } from 'react'

export function useProjectSidebarVisibility() {
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(false)
  const projectSidebarToggleRef = useRef<HTMLButtonElement | null>(null)
  const toggleProjectSidebar = useCallback((): void => {
    if (!isProjectSidebarCollapsed && document.activeElement?.closest('#project-sidebar')) {
      projectSidebarToggleRef.current?.focus()
    }
    setIsProjectSidebarCollapsed((collapsed) => !collapsed)
  }, [isProjectSidebarCollapsed])
  const revealProjectSidebar = useCallback((): void => setIsProjectSidebarCollapsed(false), [])

  return {
    isProjectSidebarCollapsed,
    projectSidebarToggleRef,
    revealProjectSidebar,
    toggleProjectSidebar
  }
}
