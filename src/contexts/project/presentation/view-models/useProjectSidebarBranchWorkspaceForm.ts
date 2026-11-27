import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import type { WorkspaceBaseBranches } from '../../application/dto/WorkspaceBaseBranches'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'

export function useProjectSidebarBranchWorkspaceForm(
  projectDirectory: string,
  onSubmit: (branchName: string, baseBranch: string) => void | Promise<boolean>
) {
  const [isOpen, setIsOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [choices, setChoices] = useState<WorkspaceBaseBranches | null>(null)
  const [baseBranch, setBaseBranch] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!isOpen) return
    let active = true
    setChoices(null)
    setBaseBranch('')
    setLoadFailed(false)
    async function load() {
      try {
        const result = await window.cleancode!.listWorkspaceBaseBranches({ projectDirectory })
        if (active) {
          setChoices(result)
          setBaseBranch(result.defaultBranch ?? '')
        }
      } catch {
        if (active) setLoadFailed(true)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [isOpen, projectDirectory, attempt])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const normalizedBranchName = branchName.trim()

    if (!normalizedBranchName || !baseBranch || submittingRef.current) {
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    void Promise.resolve()
      .then<void | boolean>(async () => onSubmit(normalizedBranchName, baseBranch))
      .then((result) => {
        if (result !== false) setIsOpen(false)
      })
      .catch(() => undefined)
      .finally(() => {
        submittingRef.current = false
        setIsSubmitting(false)
      })
  }
  const close = (): void => {
    setIsOpen(false)
  }
  const open = useCallback((): void => {
    if (submittingRef.current) return
    setBranchName('')
    setIsOpen(true)
  }, [])
  const toggle = (): void => {
    if (!isOpen) {
      setBranchName('')
    }

    setIsOpen(!isOpen)
  }
  const completeClose = useCallback((): void => setBranchName(''), [])
  const dismissFromOutside = useCallback((): void => {
    setIsOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useOutsidePointerDismiss({
    active: isOpen && !isSubmitting,
    isInside: (target) => {
      const menuId = formRef.current
        ?.querySelector('[aria-haspopup="menu"]')
        ?.getAttribute('aria-controls')
      return Boolean(
        surfaceRef.current?.contains(target) ||
        triggerRef.current?.contains(target) ||
        (menuId && document.getElementById(menuId)?.contains(target))
      )
    },
    onDismiss: dismissFromOutside,
    pointerPolicy: 'consume'
  })

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    formRef.current?.querySelector<HTMLInputElement>('input')?.focus()

    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || submittingRef.current) return
      event.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', cancelOnEscape)

    return () => {
      document.removeEventListener('keydown', cancelOnEscape)
    }
  }, [isOpen])

  return {
    branchName,
    base: {
      branches: choices?.branches ?? [],
      value: baseBranch,
      loading: !choices && !loadFailed,
      failed: loadFailed,
      select: setBaseBranch,
      retry: () => setAttempt((value) => value + 1)
    },
    close,
    completeClose,
    formRef,
    isOpen,
    isSubmitting,
    open,
    setBranchName,
    submit,
    surfaceRef,
    toggle,
    triggerRef
  }
}
