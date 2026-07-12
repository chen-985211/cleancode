import { useEffect, useRef, type RefObject } from 'react'

interface ProjectSidebarProjectRemovalPopoverProps {
  readonly projectName: string
  readonly triggerRef: RefObject<HTMLButtonElement | null>
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ProjectSidebarProjectRemovalPopover({
  projectName,
  triggerRef,
  onCancel,
  onConfirm
}: ProjectSidebarProjectRemovalPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cancelWhenClickingOutside = (event: PointerEvent): void => {
      const target = event.target

      if (
        target instanceof Node &&
        (rootRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return
      }

      onCancel()
    }

    document.addEventListener('pointerdown', cancelWhenClickingOutside)

    return () => document.removeEventListener('pointerdown', cancelWhenClickingOutside)
  }, [onCancel, triggerRef])

  return (
    <div
      className="project-removal-popover"
      ref={rootRef}
      role="dialog"
      aria-label={`移除项目 ${projectName}`}
    >
      <strong>移除项目？</strong>
      <p>停止会话并从列表移除，本地文件保留。</p>
      <div className="project-removal-popover__actions">
        <button type="button" autoFocus onClick={onCancel}>
          取消
        </button>
        <button className="project-removal-popover__confirm" type="button" onClick={onConfirm}>
          移除
        </button>
      </div>
    </div>
  )
}
