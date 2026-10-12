import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  mergeCalendars,
  parseCalendar,
  previewCalendar,
  previewCustomization,
  previewEventFilters,
} from '../apps/web/src/server/ical'
import {
  type EventFilterRule,
  eventFiltersSchema,
  matchEventFilter,
} from '../packages/db/src/event-filters'

const rule: EventFilterRule = {
  id: 'exclude',
  enabled: true,
  field: 'title',
  operator: 'contains',
  value: 'football',
  caseSensitive: false,
}
const fixture = readFileSync(new URL('./fixtures/complex.ics', import.meta.url), 'utf8')
const source = { id: 'source', snapshot: fixture, prefix: '⚽', url: 'https://provider.test/feed' }
const text = {
  title: 'Team [A]+ Football',
  description: 'Bring boots.\nMeet outside.',
  location: 'City pitch',
}

describe('literal event filters', () => {
  it.each([
    ['contains', 'football', true],
    ['equals', 'Team [A]+ Football', true],
    ['equals', 'Football', false],
    ['startsWith', 'team [a]+', true],
    ['startsWith', 'Football', false],
    ['endsWith', 'Football', true],
    ['endsWith', 'Team', false],
    ['contains', '[A]+', true],
    ['contains', '.*', false],
  ] as const)('matches %s with literal text %s', (operator, value, matches) => {
    expect(Boolean(matchEventFilter(text, [{ ...rule, operator, value }]))).toBe(matches)
  })
  it('matches chosen fields, respects case, and ignores disabled and empty rules', () => {
    expect(
      matchEventFilter(text, [{ ...rule, value: 'FOOTBALL', caseSensitive: true }]),
    ).toBeUndefined()
    expect(
      matchEventFilter(text, [{ ...rule, field: 'description', value: 'boots.\nMeet' }]),
    ).toBeDefined()
    expect(
      matchEventFilter(text, [
        { ...rule, field: 'location', operator: 'equals', value: 'City pitch' },
      ]),
    ).toBeDefined()
    expect(
      matchEventFilter(text, [{ ...rule, field: 'title', value: 'City pitch' }]),
    ).toBeUndefined()
    expect(matchEventFilter({ ...text, title: '' }, [rule])).toBeUndefined()
    expect(
      matchEventFilter(text, [
        { ...rule, enabled: false },
        { ...rule, value: '  ' },
      ]),
    ).toBeUndefined()
    expect(
      matchEventFilter({ ...text, title: 'MALMÖ' }, [{ ...rule, value: 'Malmo\u0308' }]),
    ).toBeDefined()
    expect(
      matchEventFilter(text, [
        { ...rule, value: 'Missing' },
        { ...rule, id: 'second' },
      ])?.id,
    ).toBe('second')
  })
  it('rejects blank, excessive, duplicate and invalid rules', () => {
    for (const rules of [
      [{ ...rule, value: '' }],
      [{ ...rule, value: ' \n ' }],
      [{ ...rule, value: 'x'.repeat(501) }],
      [rule, rule],
      [{ ...rule, field: 'url' }],
      [{ ...rule, operator: 'regex' }],
      Array.from({ length: 21 }, (_, index) => ({ ...rule, id: String(index) })),
    ])
      expect(eventFiltersSchema.safeParse(rules).success).toBe(false)
    expect(eventFiltersSchema.safeParse([]).success).toBe(true)
  })
})

describe('feed exclusion and preview consistency', () => {
  it.each([
    { ...rule, value: 'Fotboll', operator: 'equals' as const },
    { ...rule, value: 'Later football', operator: 'equals' as const },
    { ...rule, value: 'boots', field: 'description' as const },
    { ...rule, value: 'City pitch', field: 'location' as const },
  ])('excludes masters, moved exceptions and cancellations together for $field', (filter) => {
    const preview = previewEventFilters(fixture, [filter])
    expect(preview).toMatchObject({ total: 4, excludedCount: 3, keptCount: 1 })
    expect(preview.events.filter((event) => event.seriesMatch)).toHaveLength(2)
    expect(preview.events.every((event) => event.rule.id === filter.id)).toBe(true)
    const output = mergeCalendars('Filtered', [{ ...source, eventFilters: [filter] }])
    expect(previewCalendar(output).map((event) => event.title)).toEqual(['⚽ Weekend away'])
    expect(parseCalendar(output).getAllSubcomponents('vevent')).toHaveLength(preview.keptCount)
    expect(source.snapshot).toBe(fixture)
  })
  it('matches original text before formatting, and keeps identities and other sources intact', () => {
    const filter = { ...rule, value: 'Weekend away', operator: 'equals' as const }
    const original = previewCalendar(mergeCalendars('Original', [source]))
    const filtered = previewCalendar(
      mergeCalendars('Filtered', [{ ...source, eventFilters: [filter] }]),
    )
    expect(filtered.map((event) => event.uid)).toEqual(
      original.filter((event) => !event.allDay).map((event) => event.uid),
    )
    expect(
      previewCalendar(
        mergeCalendars('Prefix', [
          { ...source, eventFilters: [{ ...filter, value: '⚽ Weekend away' }] },
        ]),
      ),
    ).toHaveLength(4)
    expect(
      previewCalendar(
        mergeCalendars('Sources', [
          { ...source, eventFilters: [filter] },
          { ...source, id: 'another' },
        ]),
      ),
    ).toHaveLength(7)
    const renamed = {
      ...source,
      titleFormatting: { before: 'Football ', after: '', rules: [] },
      eventFilters: [rule],
    }
    expect(previewCalendar(mergeCalendars('Renamed', [renamed]))).toHaveLength(1)
  })
  it('uses the latest revision for matching and allows an intentionally fully filtered feed', () => {
    const event =
      'BEGIN:VEVENT\nUID:same\nDTSTAMP:20261001T100000Z\nDTSTART:20261007T180000Z\nSUMMARY:Football\nSEQUENCE:1\nEND:VEVENT'
    const revised = `BEGIN:VCALENDAR\nVERSION:2.0\n${event}\n${event.replace('Football', 'Kept').replace('SEQUENCE:1', 'SEQUENCE:2')}\nEND:VCALENDAR`
    expect(previewEventFilters(revised, [rule])).toMatchObject({ total: 1, excludedCount: 0 })
    expect(
      previewCalendar(
        mergeCalendars('Latest', [{ ...source, snapshot: revised, eventFilters: [rule] }]),
      ),
    ).toHaveLength(1)
    const filters = [
      { ...rule, value: 'football' },
      { ...rule, id: 'holiday', value: 'away' },
      { ...rule, id: 'master', value: 'Fotboll' },
    ]
    expect(previewEventFilters(fixture, filters).keptCount).toBe(0)
    expect(
      previewCalendar(mergeCalendars('Empty', [{ ...source, eventFilters: filters }])),
    ).toEqual([])
    expect(
      previewCalendar(
        mergeCalendars('Disabled', [{ ...source, eventFilters: [{ ...rule, enabled: false }] }]),
      ),
    ).toHaveLength(4)
  })
  it('counts and matches beyond the preview limit, and gives each direct match its own reason', () => {
    const snapshot = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      ...Array.from(
        { length: 60 },
        (_, index) =>
          `BEGIN:VEVENT\nUID:${index}\nDTSTAMP:20261001T100000Z\nDTSTART:20261007T180000Z\nSUMMARY:${index < 45 ? 'Kept' : 'Football'}\nEND:VEVENT`,
      ),
      'END:VCALENDAR',
    ].join('\n')
    expect(previewEventFilters(snapshot, [rule])).toMatchObject({
      total: 60,
      excludedCount: 15,
      keptCount: 45,
    })
    const all = previewEventFilters(snapshot, [{ ...rule, value: 'Kept' }, rule])
    expect(all.excludedCount).toBe(60)
    expect(all.events).toHaveLength(40)
    const filters = [
      { ...rule, value: 'Fotboll' },
      { ...rule, id: 'moved', value: 'Later football' },
    ]
    const preview = previewEventFilters(fixture, filters)
    expect(preview.events.find((event) => event.title === 'Later football')?.rule.id).toBe('moved')
  })
})

describe('combined customization preview', () => {
  it('formats missing summaries as empty text, without matching the display placeholder', () => {
    const snapshot =
      'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:empty-title\nDTSTAMP:20261001T100000Z\nDTSTART:20261007T180000Z\nEND:VEVENT\nEND:VCALENDAR'
    const formatting = {
      before: 'Test ',
      after: '',
      rules: [
        {
          id: 'rule',
          name: 'Placeholder',
          enabled: true,
          caseSensitive: false,
          match: [{ kind: 'text' as const, value: 'Untitled event' }],
          show: [{ kind: 'text' as const, value: 'Wrong rename' }],
        },
      ],
    }
    const preview = previewCustomization(snapshot, [], formatting)
    expect(preview.events[0]).toMatchObject({ originalTitle: '', title: 'Test ', renamedBy: null })
    expect(
      previewCalendar(
        mergeCalendars('Example', [{ ...source, snapshot, titleFormatting: formatting }]),
      )[0]?.title,
    ).toBe(preview.events[0]?.title)
  })

  it('shows the same kept titles as subscriptions and explains exclusions before renaming', () => {
    const formatting = { before: '⚽ ', after: '!', rules: [] }
    const filters = [{ ...rule, value: 'Fotboll' }]
    const preview = previewCustomization(fixture, filters, formatting)
    expect(preview).toMatchObject({ total: 4, excludedCount: 3, keptCount: 1, changedCount: 1 })
    const kept = preview.events.filter((event) => !event.exclusion)
    expect(kept.map((event) => event.title)).toEqual(
      previewCalendar(
        mergeCalendars('Example', [
          { ...source, titleFormatting: formatting, eventFilters: filters },
        ]),
      ).map((event) => event.title),
    )
    expect(kept[0]).toMatchObject({ originalTitle: 'Weekend away', title: '⚽ Weekend away!' })
    const excluded = previewCustomization(fixture, filters, formatting, 'excluded')
    expect(excluded.events).toHaveLength(3)
    expect(excluded.events.filter((event) => event.exclusion?.seriesMatch)).toHaveLength(2)
    expect(excluded.events.every((event) => event.title === event.originalTitle)).toBe(true)
    expect(previewCustomization(fixture, filters, formatting, 'changed').events).toEqual(kept)
  })
  it('filters preview views before limiting entries, while counting the complete source', () => {
    const snapshot = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      ...Array.from(
        { length: 65 },
        (_, index) =>
          `BEGIN:VEVENT\nUID:${index}\nDTSTAMP:20261001T100000Z\nDTSTART:20261007T180000Z\nSUMMARY:${index < 45 ? 'Kept' : 'Football'}\nEND:VEVENT`,
      ),
      'END:VCALENDAR',
    ].join('\n')
    const formatting = { before: '', after: '', rules: [] }
    const preview = previewCustomization(snapshot, [rule], formatting, 'excluded')
    expect(preview).toMatchObject({
      total: 65,
      excludedCount: 20,
      keptCount: 45,
      changedCount: 0,
      visibleCount: 20,
    })
    expect(preview.events).toHaveLength(20)
    expect(preview.events.every((event) => event.originalTitle === 'Football')).toBe(true)
    const changed = previewCustomization(
      snapshot,
      [rule],
      { ...formatting, before: 'Changed ' },
      'changed',
    )
    expect(changed).toMatchObject({ changedCount: 45, visibleCount: 45 })
    expect(changed.events).toHaveLength(40)
    expect(changed.events.every((event) => !event.exclusion)).toBe(true)
  })
})
