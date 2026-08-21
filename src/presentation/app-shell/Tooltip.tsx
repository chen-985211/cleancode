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

type TooltipInputMode = 'keyboard' | 'pointer' | 'programmatic'

const TooltipInputModeContext = createContext<MutableRefObject<TooltipInputMode> | null>(null)

export function TooltipProvider({
  children,
  delayDuration = 400,
  disableHoverableContent = true,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  const inputModeRef = useRef<TooltipInputMode>('programmatic')

  useEffect(() => {
    const recordKeyboardNavigation = (event: KeyboardEvent): void => {
      if (isKeyboardNavigationKey(event.key)) inputModeRef.current = 'keyboard'
    }
    const recordPointerInput = (): void => {
      inputModeRef.current = 'pointer'
    }

    document.addEventListener('keydown', recordKeyboardNavigation, true)
    document.addEventListener('pointerdown', recordPointerInput, true)
    document.addEventListener('pointermove', recordPointerInput, true)

    return () => {
      document.removeEventListener('keydown', recordKeyboardNavigation, true)
      document.removeEventListener('pointerdown', recordPointerInput, true)
      document.removeEventListener('pointermove', recordPointerInput, true)
    }
  }, [])

  return (
    <TooltipInputModeContext.Provider value={inputModeRef}>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        disableHoverableContent={disableHoverableContent}
        {...props}
      >
        {children}
      </TooltipPrimitive.Provider>
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
  ...contentProps
}: Omit<ComponentProps<typeof TooltipContent>, 'children' | 'content'> & {
  readonly children: ReactElement
  readonly content: ReactNode
  readonly dismissOnDragStart?: boolean
}) {
  const inputModeRef = useContext(TooltipInputModeContext)

  if (!inputModeRef) {
    return (
      <TooltipProvider>
        <TooltipLabelWithInputMode
          content={content}
          dismissOnDragStart={dismissOnDragStart}
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
  inputModeRef,
  ...contentProps
}: Omit<ComponentProps<typeof TooltipContent>, 'children' | 'content'> & {
  readonly children: ReactElement
  readonly content: ReactNode
  readonly dismissOnDragStart: boolean
  readonly inputModeRef?: MutableRefObject<TooltipInputMode>
}) {
  const contextInputModeRef = useContext(TooltipInputModeContext)
  const resolvedInputModeRef = inputModeRef ?? contextInputModeRef
  const dragInProgressRef = useRef(false)
  const pointerInsideRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)

  if (!resolvedInputModeRef) return null

  return (
    <Tooltip
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(
          nextOpen && (pointerInsideRef.current || resolvedInputModeRef.current === 'keyboard')
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
        onPointerMove={() => {
          if (dragInProgressRef.current) return
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
