import { useCallback, useState } from 'react'

import type { ApplicationSettingsPane } from './ApplicationSettingsRoot'

export function useApplicationSettingsNavigation() {
  const [isOpen, setIsOpen] = useState(false)
  const [initialPane, setInitialPane] = useState<ApplicationSettingsPane>('shortcuts')

  const open = useCallback((pane: ApplicationSettingsPane = 'shortcuts'): void => {
    setInitialPane(pane)
    setIsOpen(true)
  }, [])
  const close = useCallback((): void => setIsOpen(false), [])
  const openAgents = useCallback((): void => open('agents'), [open])

  return { close, initialPane, isOpen, open, openAgents }
}
