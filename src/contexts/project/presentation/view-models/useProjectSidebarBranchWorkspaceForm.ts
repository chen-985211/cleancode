import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'

export function useProjectSidebarBranchWorkspaceForm(
  onSubmit: (branchName: string) => void | Promise<boolean>
) {
  const [isOpen, setIsOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const normalizedBranchName = branchName.trim()

    if (!normalizedBranchName || submittingRef.current) {
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    void Promise.resolve()
      .then<void | boolean>(async () => onSubmit(normalizedBranchName))
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
    isInside: (target) =>
      surfaceRef.current?.contains(target) === true ||
      triggerRef.current?.contains(target) === true,
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
