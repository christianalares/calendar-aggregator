import { useMutation } from '@tanstack/react-query'
import { mutationOptions } from '@/mutations'
import { popAlert } from '.'
import { ConfirmationContent } from './confirmation-content'

export function ReplaceCalendarLinkAlert({ ownerId, id }: { ownerId: string; id: string }) {
  const rotate = useMutation(mutationOptions.outputs.rotate(ownerId))
  return (
    <ConfirmationContent
      title="Replace subscription link?"
      description="The old link will stop working for every subscriber. You will need to send them the new link."
      action="Replace link"
      pending={rotate.isPending}
      error={rotate.error}
      onConfirm={() =>
        rotate.mutate({ data: { id } }, { onSuccess: () => popAlert('replaceCalendarLink') })
      }
    />
  )
}
