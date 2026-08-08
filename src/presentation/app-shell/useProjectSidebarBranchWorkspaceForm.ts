import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

export function useProjectSidebarBranchWorkspaceForm(onSubmit: (branchName: string) => void) {
  const [isOpen, setIsOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const normalizedBranchName = branchName.trim()

    if (!normalizedBranchName) {
      return
    }

    onSubmit(normalizedBranchName)
    setIsOpen(false)
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

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    formRef.current?.querySelector<HTMLInputElement>('input')?.focus()

    const cancelWhenClickingOutside = (event: PointerEvent): void => {
      const target = event.target

      if (
        target instanceof Node &&
        (surfaceRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return
      }

      setIsOpen(false)
    }

    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', cancelWhenClickingOutside)
    document.addEventListener('keydown', cancelOnEscape)

    return () => {
      document.removeEventListener('pointerdown', cancelWhenClickingOutside)
      document.removeEventListener('keydown', cancelOnEscape)
    }
  }, [isOpen])

  return {
    branchName,
    close,
    completeClose,
    formRef,
    isOpen,
    open,
    setBranchName,
    submit,
    surfaceRef,
    toggle,
    triggerRef
  }
}
