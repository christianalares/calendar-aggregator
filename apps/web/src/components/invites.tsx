import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { queryOptions } from '../queries'
import { serverFns } from '../server-fns'

export function Invites({ ownerId, baseURL }: { ownerId: string; baseURL: string }) {
  const { data: invites } = useSuspenseQuery(queryOptions.invitations.list(ownerId))
  const [message, setMessage] = useState('')
  const createInviteMutation = useMutation({
    mutationFn: serverFns.invitations.create,
    onSuccess: (_data, _variables, _result, context) => {
      return context.client.invalidateQueries(queryOptions.invitations.list(ownerId))
    },
  })
  const revokeInviteMutation = useMutation({
    mutationFn: serverFns.invitations.revoke,
    onSuccess: (_data, _variables, _result, context) => {
      return context.client.invalidateQueries(queryOptions.invitations.list(ownerId))
    },
  })

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(`${baseURL}/invite/${token}`)
      setMessage('Invitation link copied.')
    } catch {
      setMessage('Could not copy. Select the link below to copy it manually.')
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>Invites</h2>
          <p>A little calendar club, by invitation.</p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={createInviteMutation.isPending}
          onClick={() => createInviteMutation.mutate()}
        >
          Create invite
        </button>
      </div>
      {message && <output>{message}</output>}
      {(createInviteMutation.error || revokeInviteMutation.error) && (
        <p role="alert" className="error">
          Could not update invitations. Please try again.
        </p>
      )}
      {invites.length === 0 && (
        <p className="empty">No invitations yet. Create one and send the link to a friend.</p>
      )}
      {invites.map((invite) => (
        <div className="invite-row" key={invite.id}>
          <div>
            <strong>
              {invite.usedAt ? 'Used' : invite.revokedAt ? 'Revoked' : 'Ready to share'}
            </strong>
            <p>{invite.usedBy ?? `Created ${new Date(invite.createdAt).toLocaleDateString()}`}</p>
            {!invite.usedAt && !invite.revokedAt && (
              <input
                aria-label="Invitation URL"
                readOnly
                value={`${baseURL}/invite/${invite.token}`}
              />
            )}
          </div>
          {!invite.usedAt && !invite.revokedAt && (
            <div className="actions">
              <button type="button" onClick={() => copy(invite.token)}>
                Copy link
              </button>
              <button
                type="button"
                disabled={revokeInviteMutation.isPending}
                onClick={() => revokeInviteMutation.mutate({ data: { id: invite.id } })}
              >
                Revoke
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
