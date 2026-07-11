import { useEffect, useRef, useState, type FormEvent } from 'react'

export function useProjectSidebarBranchWorkspaceForm(onSubmit: (branchName: string) => void) {
  const [isOpen, setIsOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const normalizedBranchName = branchName.trim()

    if (!normalizedBranchName) {
      return
    }

    onSubmit(normalizedBranchName)
    setBranchName('')
    setIsOpen(false)
  }
  const toggle = (): void => {
    if (isOpen) {
      setBranchName('')
    }

    setIsOpen(!isOpen)
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const cancelWhenClickingOutside = (event: PointerEvent): void => {
      const target = event.target

      if (
        target instanceof Node &&
        (formRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return
      }

      setBranchName('')
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', cancelWhenClickingOutside)

    return () => document.removeEventListener('pointerdown', cancelWhenClickingOutside)
  }, [isOpen])

  return { branchName, formRef, isOpen, setBranchName, submit, toggle, triggerRef }
}
