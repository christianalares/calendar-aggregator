import { useMutation } from '@tanstack/react-query'
import { mutationOptions } from '@/mutations'
import { popAlert } from '.'
import { ConfirmationContent } from './confirmation-content'

export function DeleteCalendarAlert({
  ownerId,
  id,
  name,
}: {
  ownerId: string
  id: string
  name: string
}) {
  const remove = useMutation(mutationOptions.outputs.remove(ownerId))
  return (
    <ConfirmationContent
      title={`Delete ${name}?`}
      description="Its subscription link will stop working for every subscriber."
      action="Delete calendar"
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() =>
        remove.mutate({ data: { id } }, { onSuccess: () => popAlert('deleteCalendar') })
      }
    />
  )
}
