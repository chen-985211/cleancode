import {
  Edit3,
  Link,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  Square,
  type LucideProps
} from 'lucide-react'

type TerminalGroupIconProps = Omit<LucideProps, 'absoluteStrokeWidth'>

export function GroupStartIcon(props: TerminalGroupIconProps) {
  return <Play {...props} aria-hidden="true" data-icon="group-start" fill="currentColor" />
}

export function GroupStopIcon(props: TerminalGroupIconProps) {
  return <Square {...props} aria-hidden="true" data-icon="group-stop" />
}

export function GroupRestartIcon({
  className,
  size = 24,
  strokeWidth = 2,
  ...props
}: TerminalGroupIconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      className={className}
      data-icon="group-restart"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 7h13" />
      <path d="M17 11V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h5" />
      <path d="m7 10 2 2-2 2" />
      <path d="M13.25 15.25a4.5 4.5 0 1 1-.25 4.5" />
      <path d="M13.25 12.75v2.5h2.5" />
    </svg>
  )
}

export function GroupEditIcon(props: TerminalGroupIconProps) {
  return <Edit3 {...props} aria-hidden="true" data-icon="group-edit" />
}

export function GroupAddIcon(props: TerminalGroupIconProps) {
  return <Plus {...props} aria-hidden="true" data-icon="group-add" />
}

export function GroupRemoveIcon(props: TerminalGroupIconProps) {
  return <Minus {...props} aria-hidden="true" data-icon="group-remove" />
}

export function GroupDissolveIcon({
  className,
  size = 24,
  strokeWidth = 2,
  ...props
}: TerminalGroupIconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      className={className}
      data-icon="group-dissolve"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10 13a4 4 0 0 0 6.04.43l2.4-2.4a4 4 0 0 0-5.66-5.66l-1.36 1.37" />
      <path d="M14 11a4 4 0 0 0-6.04-.43l-2.4 2.4a4 4 0 0 0 5.66 5.66l1.36-1.37" />
      <path className="terminal-group-icon__cutout" d="m14.35 14.7 2.35 2.35" />
      <path
        className="terminal-group-icon__disconnect-accent"
        d="M15.2 14.2a3.8 3.8 0 1 1-1.1 2.7"
        data-icon-part="disconnect-accent"
      />
    </svg>
  )
}

export function GroupMemberUnlinkIcon(props: TerminalGroupIconProps) {
  return <Link {...props} aria-hidden="true" data-icon="group-member-unlink" />
}

export function GroupExpandIcon(props: TerminalGroupIconProps) {
  return <Maximize2 {...props} aria-hidden="true" data-icon="group-expand" />
}

export function GroupCollapseIcon(props: TerminalGroupIconProps) {
  return <Minimize2 {...props} aria-hidden="true" data-icon="group-collapse" />
}
