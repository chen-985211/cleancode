import type { ButtonHTMLAttributes } from 'react'

import { useSelectionFeedbackMotion } from '../hooks/useSelectionMotion'

interface ApplicationSettingsSwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-checked' | 'role'
> {
  readonly checked: boolean
  readonly label: string
}

export function ApplicationSettingsSwitch({
  checked,
  className,
  label,
  ...props
}: ApplicationSettingsSwitchProps) {
  const selectionMotionRef = useSelectionFeedbackMotion(checked)

  return (
    <button
      {...props}
      ref={selectionMotionRef}
      aria-checked={checked}
      aria-label={label}
      className={['application-settings-switch', className].filter(Boolean).join(' ')}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" />
    </button>
  )
}
