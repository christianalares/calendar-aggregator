import { useEffect, useRef } from 'react'
import { popAlert } from '.'
import { ConfirmationContent } from './confirmation-content'

export function DiscardCalendarChangesAlert({
  onDiscard,
  onKeep,
}: {
  onDiscard: () => void
  onKeep: () => void
}) {
  const discarded = useRef(false)
  useEffect(
    () => () => {
      if (!discarded.current) onKeep()
    },
    [onKeep],
  )
  return (
    <ConfirmationContent
      title="Discard unsaved changes?"
      description="Your filters, titles, and source selection have not been saved."
      action="Discard changes"
      pending={false}
      error={null}
      onConfirm={() => {
        discarded.current = true
        onDiscard()
        popAlert('discardCalendarChanges')
      }}
    />
  )
}
