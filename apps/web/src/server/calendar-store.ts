import { randomBytes, randomUUID } from 'node:crypto'
import { type Database, outputSources, outputs, sources } from '@calendar-aggregator/db'
import type { EventFilterRule } from '@calendar-aggregator/db/event-filters'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { z } from 'zod'

import type { outputInput, sourceInput } from '../lib/calendar-inputs'

import { CalendarError } from '../lib/errors'
import { previewCalendar, previewEventFilters } from './ical'

export { CalendarError } from '../lib/errors'

export function createCalendarStore(db: Database) {
  async function requireOutput(ownerId: string, id: string) {
    const [output] = await db
      .select()
      .from(outputs)
      .where(and(eq(outputs.id, id), eq(outputs.ownerId, ownerId)))

    if (!output) {
      throw new CalendarError('Calendar not found.')
    }

    return output
  }

  return {
    async list(ownerId: string) {
      const [sourceRows, outputRows] = await Promise.all([
        db
          .select({
            id: sources.id,
            name: sources.name,
            url: sources.url,
            enabled: sources.enabled,
            useBrowser: sources.useBrowser,
            lastAttemptAt: sources.lastAttemptAt,
            lastSuccessAt: sources.lastSuccessAt,
            lastError: sources.lastError,
            snapshot: sources.snapshot,
          })
          .from(sources)
          .where(eq(sources.ownerId, ownerId))
          .orderBy(asc(sources.createdAt)),
        db
          .select()
          .from(outputs)
          .where(eq(outputs.ownerId, ownerId))
          .orderBy(asc(outputs.createdAt)),
      ])
      const memberships = outputRows.length
        ? await db
            .select()
            .from(outputSources)
            .where(
              inArray(
                outputSources.outputId,
                outputRows.map((row) => row.id),
              ),
            )
        : []

      return {
        sources: sourceRows.map(({ snapshot, ...source }) => ({
          ...source,
          sampleTitles: snapshot
            ? [...new Set(previewCalendar(snapshot).map((event) => event.title))].slice(0, 20)
            : [],
        })),
        outputs: outputRows.map((output) => ({
          ...output,
          sources: memberships.filter((membership) => membership.outputId === output.id),
        })),
      }
    },
    async saveSource(ownerId: string, input: z.input<typeof sourceInput>) {
      if (!input.id) {
        const id = randomUUID()
        await db.insert(sources).values({
          id,
          ownerId,
          name: input.name,
          url: input.url,
          enabled: input.enabled,
          useBrowser: input.useBrowser ?? false,
        })

        return { id }
      }

      const [updated] = await db
        .update(sources)
        .set({
          name: input.name,
          url: input.url,
          enabled: input.enabled,
          useBrowser: input.useBrowser ?? false,
          version: sql`${sources.version} + 1`,
          nextFetchAt: null,
          leaseUntil: null,
          lastError: sql`case when ${sources.url} <> ${input.url} then 'Source URL changed. Waiting for a fresh check.' else ${sources.lastError} end`,
        })
        .where(and(eq(sources.id, input.id), eq(sources.ownerId, ownerId)))
        .returning({ id: sources.id })

      if (!updated) {
        throw new CalendarError('Source not found.')
      }

      return updated
    },
    async removeSource(ownerId: string, id: string) {
      const [removed] = await db
        .delete(sources)
        .where(and(eq(sources.id, id), eq(sources.ownerId, ownerId)))
        .returning({ id: sources.id })

      if (!removed) {
        throw new CalendarError('Source not found.')
      }
    },
    async saveOutput(ownerId: string, input: z.infer<typeof outputInput>) {
      return await db.transaction(async (tx) => {
        const ids = input.sources.map((item) => item.sourceId)
        const owned = ids.length
          ? await tx
              .select({ id: sources.id })
              .from(sources)
              .where(and(eq(sources.ownerId, ownerId), inArray(sources.id, ids)))
          : []

        if (owned.length !== ids.length) {
          throw new CalendarError('Choose sources from your own account.')
        }

        const id = input.id ?? randomUUID()

        if (input.id) {
          const [output] = await tx
            .update(outputs)
            .set({ name: input.name })
            .where(and(eq(outputs.id, id), eq(outputs.ownerId, ownerId)))
            .returning({ id: outputs.id })

          if (!output) {
            throw new CalendarError('Calendar not found.')
          }

          await tx.delete(outputSources).where(eq(outputSources.outputId, id))
        } else {
          await tx
            .insert(outputs)
            .values({ id, ownerId, name: input.name, token: randomBytes(32).toString('hex') })
        }

        if (input.sources.length) {
          await tx
            .insert(outputSources)
            .values(
              input.sources.map((item) => ({ ...item, prefix: item.prefix ?? '', outputId: id })),
            )
        }

        return { id }
      })
    },
    async removeOutput(ownerId: string, id: string) {
      const [removed] = await db
        .delete(outputs)
        .where(and(eq(outputs.id, id), eq(outputs.ownerId, ownerId)))
        .returning({ id: outputs.id })

      if (!removed) {
        throw new CalendarError('Calendar not found.')
      }
    },
    async rotateOutput(ownerId: string, id: string) {
      const [rotated] = await db
        .update(outputs)
        .set({ token: randomBytes(32).toString('hex') })
        .where(and(eq(outputs.id, id), eq(outputs.ownerId, ownerId)))
        .returning({ token: outputs.token })

      if (!rotated) {
        throw new CalendarError('Calendar not found.')
      }

      return rotated
    },
    requireOutput,
    async previewFilters(ownerId: string, sourceId: string, rules: EventFilterRule[]) {
      const [source] = await db
        .select()
        .from(sources)
        .where(and(eq(sources.id, sourceId), eq(sources.ownerId, ownerId)))
      if (!source) throw new CalendarError('Source not found.')
      return {
        available: source.snapshot !== null,
        enabled: source.enabled,
        lastSuccessAt: source.lastSuccessAt,
        error: source.lastError,
        ...previewEventFilters(
          source.snapshot ?? 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR',
          rules,
        ),
      }
    },
    async outputForToken(token: string) {
      const [output] = await db.select().from(outputs).where(eq(outputs.token, token))

      return output ?? null
    },
    async includedSources(output: typeof outputs.$inferSelect) {
      return await db
        .select({
          source: sources,
          prefix: outputSources.prefix,
          titleFormatting: outputSources.titleFormatting,
          eventFilters: outputSources.eventFilters,
        })
        .from(outputSources)
        .innerJoin(sources, eq(outputSources.sourceId, sources.id))
        .where(
          and(
            eq(outputSources.outputId, output.id),
            eq(sources.ownerId, output.ownerId),
            eq(sources.enabled, true),
          ),
        )
        .orderBy(asc(sources.createdAt))
    },
  }
}
