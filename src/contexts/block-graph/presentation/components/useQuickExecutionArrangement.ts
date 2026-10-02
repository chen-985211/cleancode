import { useCallback, useEffect, useRef, useState } from 'react'

export function useQuickExecutionArrangement(open: boolean, popoverOpen: boolean) {
  const [isArranging, setIsArranging] = useState(false)
  const entryRef = useRef<HTMLButtonElement | null>(null)
  const doneRef = useRef<HTMLButtonElement | null>(null)
  const finishArranging = useCallback((): void => {
    setIsArranging(false)
    entryRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (isArranging && open) doneRef.current?.focus({ preventScroll: true })
  }, [isArranging, open])

  useEffect(() => {
    if (!isArranging || !open) return undefined
    const finishOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !popoverOpen) finishArranging()
    }
    document.addEventListener('keydown', finishOnEscape)
    return () => document.removeEventListener('keydown', finishOnEscape)
  }, [finishArranging, isArranging, open, popoverOpen])

  return { isArranging, setIsArranging, entryRef, doneRef, finishArranging }
}
