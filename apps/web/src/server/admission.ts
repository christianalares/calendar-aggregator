import { authUsers, type Database, invitations, members } from '@calendar-aggregator/db'
import { and, eq, isNull } from 'drizzle-orm'

export async function admitIdentity(
  db: Database,
  identityId: string,
  invitationToken: string | undefined,
  operatorEmail: string | undefined,
) {
  return await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, identityId))
      .for('update')

    if (!user || !user.emailVerified) {
      throw new Error('A verified Google identity is required.')
    }

    const [existing] = await tx.select().from(members).where(eq(members.userId, identityId))

    if (existing) {
      return existing
    }

    if (operatorEmail && user.email.toLowerCase() === operatorEmail.toLowerCase()) {
      const [member] = await tx
        .insert(members)
        .values({ userId: identityId, role: 'operator' })
        .returning()

      if (!member) {
        throw new Error('Could not provision the operator account.')
      }

      return member
    }

    if (!invitationToken) {
      throw new Error('An invitation is required to join.')
    }

    const [invitation] = await tx
      .update(invitations)
      .set({ usedAt: new Date(), usedBy: identityId })
      .where(
        and(
          eq(invitations.token, invitationToken),
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id })

    if (!invitation) {
      throw new Error('This invitation has been used or revoked.')
    }

    const [member] = await tx.insert(members).values({ userId: identityId }).returning()

    if (!member) {
      throw new Error('Could not complete admission.')
    }

    return member
  })
}
