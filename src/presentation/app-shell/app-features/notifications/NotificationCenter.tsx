import { useId, useState, type CSSProperties } from 'react'

import { useI18n } from '../../../i18n/useI18n'
import { TooltipLabel } from '../../../shared/components/Tooltip'
import { NotificationCard } from './NotificationCard'
import {
  createNotificationStackState,
  synchronizeNotificationStack,
  type AppNotificationPresentation
} from './notificationStack'
import { useNotificationStackInteraction } from './useNotificationStackInteraction'

interface NotificationCenterProps {
  readonly notifications: readonly AppNotificationPresentation[]
  readonly onDismiss: (notificationId: string) => void
  readonly onExitComplete: (notificationId: string, exitToken: number) => void
}

export function NotificationCenter({
  notifications,
  onDismiss,
  onExitComplete
}: NotificationCenterProps) {
  const { t } = useI18n()
  const stackId = useId()
  const openIds = notifications
    .filter(({ open }) => open)
    .map(({ notification }) => notification.id)
  const { expanded, inspecting, paused, toggleRef, viewportRef, toggleProps, viewportProps } =
    useNotificationStackInteraction(openIds)
  const [stackState, setStackState] = useState(createNotificationStackState)
  const stack = synchronizeNotificationStack(stackState, notifications, inspecting)
  if (stack !== stackState) setStackState(stack)
  if (notifications.length === 0) return null

  const byId = new Map(notifications.map((item) => [item.notification.id, item]))
  const ordered = stack.order.map((id) => byId.get(id)!)
  const openOrder = ordered.filter(({ open }) => open).map(({ notification }) => notification.id)
  const positions = new Map(openOrder.map((id, index) => [id, index]))
  const count = openOrder.length
  const toggleLabel = t('notifications.expand', { count })
  const toggle =
    count > 1 ? (
      <TooltipLabel content={toggleLabel}>
        <button
          aria-controls={stackId}
          aria-expanded={expanded}
          aria-label={toggleLabel}
          className="notification-card__expand"
          data-notification-toggle=""
          ref={toggleRef}
          type="button"
          {...toggleProps}
        >
          {t('notifications.more', { count: count - 1 })}
        </button>
      </TooltipLabel>
    ) : null

  return (
    <div
      aria-label={t('notifications.label')}
      className="notification-viewport"
      data-expanded={expanded}
      ref={viewportRef}
      role="region"
      style={
        {
          '--notification-count': Math.max(count, 1),
          '--notification-depth': Math.min(Math.max(count - 1, 0), 2)
        } as CSSProperties
      }
      {...viewportProps}
    >
      <div className="notification-stack" id={stackId}>
        {ordered.map((presentation, previousIndex) => {
          const index = presentation.open
            ? positions.get(presentation.notification.id)!
            : previousIndex
          const concealed = !expanded && index > 0
          return (
            <div
              aria-hidden={concealed || !presentation.open ? true : undefined}
              className="notification-stack-item"
              data-concealed={concealed}
              data-overflowed={!expanded && index > 2}
              inert={concealed || !presentation.open}
              key={presentation.notification.id}
              style={
                {
                  '--notification-index': index,
                  zIndex: presentation.open ? count - index : notifications.length + 1
                } as CSSProperties
              }
            >
              <NotificationCard
                concealed={concealed}
                onDismiss={onDismiss}
                onExitComplete={onExitComplete}
                paused={paused || concealed}
                presentation={presentation}
                toggle={presentation.open && index === 0 ? toggle : null}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
