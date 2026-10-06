import { useMutation } from '@tanstack/react-query'
import { mutationOptions } from '@/mutations'
import { popAlert } from '.'
import { ConfirmationContent } from './confirmation-content'

export function DeleteSourceAlert({
  ownerId,
  id,
  name,
}: {
  ownerId: string
  id: string
  name: string
}) {
  const remove = useMutation(mutationOptions.sources.remove(ownerId))
  return (
    <ConfirmationContent
      title={`Delete ${name}?`}
      description="This source will be removed from every calendar that includes it."
      action="Delete source"
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() =>
        remove.mutate({ data: { id } }, { onSuccess: () => popAlert('deleteSource') })
      }
    />
  )
}
