import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Copy, Plus } from 'lucide-react'
import { useState } from 'react'
import { pushAlert } from '@/components/alerts'
import { SectionHeader } from '@/components/section-header'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { queryOptions } from '../queries'
import { serverFns } from '../server-fns'

export function Invites({ ownerId, baseURL }: { ownerId: string; baseURL: string }) {
  const { data: invites } = useSuspenseQuery(queryOptions.invitations.list(ownerId))
  const [message, setMessage] = useState('')
  const createInviteMutation = useMutation({
    mutationFn: serverFns.invitations.create,
    onSuccess: (_data, _variables, _result, context) =>
      context.client.invalidateQueries(queryOptions.invitations.list(ownerId)),
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
    <section aria-label="Invites" className="min-w-0">
      <SectionHeader
        title="Invites"
        count={invites.length}
        description="A calendar corner for you and your pals."
        action={
          <Button
            disabled={createInviteMutation.isPending}
            onClick={() => createInviteMutation.mutate()}
          >
            <Plus aria-hidden="true" />
            Create invite
          </Button>
        }
      />
      {message && <output className="mb-3 block text-sm text-muted-foreground">{message}</output>}
      {createInviteMutation.error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Could not update invitations. Please try again.
        </p>
      )}
      <Card className="gap-0 overflow-hidden py-0">
        <Table aria-label="Invites">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Used by</TableHead>
              <TableHead>Invitation link</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!invites.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="whitespace-normal px-4 py-8 text-center text-muted-foreground"
                >
                  No invitations yet. Create one and send the link to a friend.
                </TableCell>
              </TableRow>
            )}
            {invites.map((invite) => {
              const available = !invite.usedAt && !invite.revokedAt
              return (
                <TableRow key={invite.id}>
                  <TableCell className="py-3 pl-4 text-xs tabular-nums text-muted-foreground">
                    {new Date(invite.createdAt).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={available ? 'warning' : invite.usedAt ? 'success' : 'neutral'}
                    >
                      {invite.usedAt ? 'Used' : invite.revokedAt ? 'Revoked' : 'Ready to share'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-sm">{invite.usedBy ?? '—'}</TableCell>
                  <TableCell>
                    {available ? (
                      <Input
                        aria-label="Invitation URL"
                        readOnly
                        value={`${baseURL}/invite/${invite.token}`}
                        onFocus={(event) => event.target.select()}
                        className="min-w-44 max-w-72 text-xs text-muted-foreground"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">No longer active</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    {available && (
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => copy(invite.token)}>
                          <Copy aria-hidden="true" />
                          Copy link
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => pushAlert('revokeInvite', { ownerId, id: invite.id })}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </section>
  )
}
