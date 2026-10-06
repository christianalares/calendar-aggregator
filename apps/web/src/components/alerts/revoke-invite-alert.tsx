import { useMutation } from '@tanstack/react-query'
import { queryOptions } from '@/queries'
import { serverFns } from '@/server-fns'
import { popAlert } from '.'
import { ConfirmationContent } from './confirmation-content'

export function RevokeInviteAlert({ ownerId, id }: { ownerId: string; id: string }) {
  const revoke = useMutation({
    mutationFn: serverFns.invitations.revoke,
    onSuccess: async (_data, _variables, _result, context) => {
      await context.client.invalidateQueries(queryOptions.invitations.list(ownerId))
      popAlert('revokeInvite')
    },
  })
  return (
    <ConfirmationContent
      title="Revoke invitation?"
      description="This invitation link will no longer allow someone to create an account."
      action="Revoke invitation"
      pending={revoke.isPending}
      error={revoke.error}
      onConfirm={() => revoke.mutate({ data: { id } })}
    />
  )
}
