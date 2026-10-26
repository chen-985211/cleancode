import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
  type ReactElement,
  type ReactNode
} from 'react'

type TooltipInputMode = 'keyboard' | 'pointer' | 'pointer-gesture' | 'programmatic'

const TooltipInputModeContext = createContext<MutableRefObject<TooltipInputMode> | null>(null)
const TooltipPointerSuspendedContext = createContext(false)

export function TooltipProvider({
  children,
  delayDuration = 400,
  disableHoverableContent = true,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  const inputModeRef = useRef<TooltipInputMode>('programmatic')
  const pointerPressedRef = useRef(false)
  const [isPointerSuspended, setIsPointerSuspended] = useState(false)

  useEffect(() => {
    const recordKeyboardNavigation = (event: KeyboardEvent): void => {
      if (pointerPressedRef.current || !isKeyboardNavigationKey(event.key)) return
      inputModeRef.current = 'keyboard'
      setIsPointerSuspended(false)
    }
    const recordPointerDown = (): void => {
      pointerPressedRef.current = true
      inputModeRef.current = 'pointer-gesture'
      setIsPointerSuspended(true)
    }
    const recordPointerMove = (event: PointerEvent): void => {
      pointerPressedRef.current = event.buttons > 0
      inputModeRef.current = pointerPressedRef.current ? 'pointer-gesture' : 'pointer'
      setIsPointerSuspended(pointerPressedRef.current)
    }
    const finishPointerGesture = (): void => {
      // Release alone must not revive the hover that preceded the gesture.
      pointerPressedRef.current = false
    }

    document.addEventListener('keydown', recordKeyboardNavigation, true)
    document.addEventListener('pointerdown', recordPointerDown, true)
    document.addEventListener('pointermove', recordPointerMove, true)
    document.addEventListener('pointerup', finishPointerGesture, true)
    document.addEventListener('pointercancel', finishPointerGesture, true)
    document.addEventListener('lostpointercapture', finishPointerGesture, true)
    window.addEventListener('blur', finishPointerGesture)

    return () => {
      document.removeEventListener('keydown', recordKeyboardNavigation, true)
      document.removeEventListener('pointerdown', recordPointerDown, true)
      document.removeEventListener('pointermove', recordPointerMove, true)
      document.removeEventListener('pointerup', finishPointerGesture, true)
      document.removeEventListener('pointercancel', finishPointerGesture, true)
      document.removeEventListener('lostpointercapture', finishPointerGesture, true)
      window.removeEventListener('blur', finishPointerGesture)
    }
  }, [])

  return (
    <TooltipInputModeContext.Provider value={inputModeRef}>
      <TooltipPointerSuspendedContext.Provider value={isPointerSuspended}>
        <TooltipPrimitive.Provider
          delayDuration={delayDuration}
          disableHoverableContent={disableHoverableContent}
          {...props}
        >
          {children}
        </TooltipPrimitive.Provider>
      </TooltipPointerSuspendedContext.Provider>
    </TooltipInputModeContext.Provider>
  )
}

export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

export function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />
}

export function TooltipContent({
  children,
  className,
  collisionPadding = 12,
  side = 'top',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={['cc-tooltip-content', className].filter(Boolean).join(' ')}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="cc-tooltip-arrow" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export function TooltipLabel({
  children,
  content,
  dismissOnDragStart = false,
  disabled = false,
  ...contentProps
}: Omit<ComponentProps<typeof TooltipContent>, 'children' | 'content'> & {
  readonly children: ReactElement
  readonly content: ReactNode
  readonly dismissOnDragStart?: boolean
  readonly disabled?: boolean
}) {
  const inputModeRef = useContext(TooltipInputModeContext)

  if (!inputModeRef) {
    return (
      <TooltipProvider>
        <TooltipLabelWithInputMode
          content={content}
          dismissOnDragStart={dismissOnDragStart}
          disabled={disabled}
          {...contentProps}
        >
          {children}
        </TooltipLabelWithInputMode>
      </TooltipProvider>
    )
  }

  return (
    <TooltipLabelWithInputMode
      inputModeRef={inputModeRef}
      content={content}
      dismissOnDragStart={dismissOnDragStart}
      disabled={disabled}
      {...contentProps}
    >
      {children}
    </TooltipLabelWithInputMode>
  )
}

function TooltipLabelWithInputMode({
  children,
  content,
  dismissOnDragStart,
  disabled,
  inputModeRef,
  ...contentProps
}: Omit<ComponentProps<typeof TooltipContent>, 'children' | 'content'> & {
  readonly children: ReactElement
  readonly content: ReactNode
  readonly dismissOnDragStart: boolean
  readonly disabled: boolean
  readonly inputModeRef?: MutableRefObject<TooltipInputMode>
}) {
  const contextInputModeRef = useContext(TooltipInputModeContext)
  const isPointerSuspended = useContext(TooltipPointerSuspendedContext)
  const resolvedInputModeRef = inputModeRef ?? contextInputModeRef
  const dragInProgressRef = useRef(false)
  const pointerInsideRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!disabled && !isPointerSuspended) return
    pointerInsideRef.current = false
    dragInProgressRef.current = false
  }, [disabled, isPointerSuspended])
  if ((disabled || isPointerSuspended) && isOpen) setIsOpen(false)
  if (!resolvedInputModeRef) return null

  return (
    <Tooltip
      open={!disabled && !isPointerSuspended && isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(
          !disabled &&
            nextOpen &&
            resolvedInputModeRef.current !== 'pointer-gesture' &&
            (pointerInsideRef.current || resolvedInputModeRef.current === 'keyboard')
        )
      }}
    >
      <TooltipTrigger
        asChild
        onDragStart={() => {
          if (!dismissOnDragStart) return
          dragInProgressRef.current = true
          pointerInsideRef.current = false
          setIsOpen(false)
        }}
        onDragEnd={() => {
          dragInProgressRef.current = false
        }}
        onPointerMove={(event) => {
          if (disabled || dragInProgressRef.current || event.buttons > 0) return
          pointerInsideRef.current = true
        }}
        onPointerLeave={() => {
          pointerInsideRef.current = false
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent {...contentProps}>{content}</TooltipContent>
    </Tooltip>
  )
}

function isKeyboardNavigationKey(key: string): boolean {
  return (
    key === 'Tab' ||
    key === 'ArrowUp' ||
    key === 'ArrowRight' ||
    key === 'ArrowDown' ||
    key === 'ArrowLeft' ||
    key === 'Home' ||
    key === 'End' ||
    key === 'PageUp' ||
    key === 'PageDown'
  )
}
