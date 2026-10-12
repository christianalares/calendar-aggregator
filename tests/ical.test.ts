import { readFileSync } from 'node:fs'
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { previewRangeInput } from '../apps/web/src/lib/calendar-inputs'
import {
  mergeCalendars,
  parseCalendar,
  previewCalendar,
  previewCalendarRange,
} from '../apps/web/src/server/ical'
import { type TitleRule, titleFormattingFromPrefix } from '../packages/db/src/title-formatting'

const fixture = readFileSync(new URL('./fixtures/complex.ics', import.meta.url), 'utf8')
const input = (id = 'source-a', snapshot = fixture, prefix = '⚽') => ({
  id,
  snapshot,
  prefix,
  url: 'https://provider.test/private/abcdefghijklmnopqrstuvwx?token=super-private-token',
})

const october = { from: '2026-10-01', to: '2026-11-01', timeZone: 'Europe/Stockholm' }
const calendar = (events: string[]) =>
  `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:fixture\n${events.join('\n')}\nEND:VCALENDAR`
const entry = (uid: string, properties: string) =>
  `BEGIN:VEVENT\nUID:${uid}\nDTSTAMP:20261001T100000Z\n${properties}\nSUMMARY:${uid}\nEND:VEVENT`

describe('monthly calendar preview', () => {
  it('validates bounded date ranges and the viewer time zone', () => {
    expect(previewRangeInput.safeParse(october).success).toBe(true)
    for (const range of [
      { ...october, from: '2026-11-01' },
      { ...october, to: '2027-01-01' },
      { ...october, from: '2026-02-30' },
      { ...october, timeZone: 'Invalid/Zone' },
    ])
      expect(previewRangeInput.safeParse(range).success).toBe(false)
  })
  it('keeps all entries beyond the old 40-entry sample and loads the requested month', () => {
    const text = calendar([
      ...Array.from({ length: 60 }, (_, index) =>
        entry(`old-${index}`, 'DTSTART:20250101T120000Z'),
      ),
      ...Array.from({ length: 50 }, (_, index) =>
        entry(`october-${index}`, 'DTSTART:20261019T120000Z'),
      ),
      entry('november', 'DTSTART:20261105T120000Z'),
    ])
    expect(previewCalendar(text)).toHaveLength(111)
    expect(previewCalendarRange(text, october).events).toHaveLength(50)
    expect(
      previewCalendarRange(text, { ...october, from: '2026-11-01', to: '2026-12-01' }).events.map(
        (event) => event.title,
      ),
    ).toEqual(['november'])
  })

  it('expands historical recurring series, excludes EXDATE, and applies each exception once', () => {
    const text = fixture
      .replace('20261007T180000', '20260930T180000')
      .replace('20261007T190000', '20260930T190000')
      .replace('COUNT=4', 'COUNT=6')
    const preview = previewCalendarRange(mergeCalendars('Our week', [input('a', text)]), october)
    expect(preview.limited).toBe(false)
    expect(preview.events.map((event) => [event.title, event.start])).toEqual([
      ['⚽ Fotboll', '2026-10-07T16:00:00.000Z'],
      ['⚽ Weekend away', '2026-10-10'],
      ['⚽ Later football', '2026-10-14T17:00:00.000Z'],
      ['⚽ Cancelled football', '2026-10-28T17:00:00.000Z'],
    ])
    expect(preview.events[1]?.end).toBe('2026-10-12')
    expect(preview.events[3]?.cancelled).toBe(true)
  })

  it('expands IANA zones without VTIMEZONE across the daylight-saving change', () => {
    const text = calendar([
      entry('weekly', 'DTSTART;TZID=Europe/Stockholm:20261018T180000\nRRULE:FREQ=WEEKLY;COUNT=3'),
    ])
    expect(previewCalendarRange(text, october).events.map((event) => event.start)).toEqual([
      '2026-10-18T16:00:00.000Z',
      '2026-10-25T17:00:00.000Z',
    ])
  })

  it('includes moved exceptions arriving from another month and removes their original slot', () => {
    const text = calendar([
      entry('series', 'DTSTART:20260930T120000Z\nRRULE:FREQ=MONTHLY;COUNT=3'),
      entry('series', 'RECURRENCE-ID:20260930T120000Z\nDTSTART:20261002T120000Z'),
      entry('series', 'RECURRENCE-ID:20261030T120000Z\nDTSTART:20261102T120000Z'),
    ])
    expect(previewCalendarRange(text, october).events.map((event) => event.start)).toEqual([
      '2026-10-02T12:00:00.000Z',
    ])
  })

  it('retains distinct occurrences moved to the same time and supports cancellation without DTSTART', () => {
    const text = calendar([
      entry('series', 'DTSTART:20261005T120000Z\nRRULE:FREQ=DAILY;COUNT=3'),
      entry('series', 'RECURRENCE-ID:20261006T120000Z\nDTSTART:20261005T120000Z'),
      entry('series', 'RECURRENCE-ID:20261007T120000Z\nSTATUS:CANCELLED'),
    ])
    const events = previewCalendarRange(text, october).events
    expect(events).toHaveLength(3)
    expect(events.filter((event) => event.start === '2026-10-05T12:00:00.000Z')).toHaveLength(2)
    expect(events.find((event) => event.cancelled)?.start).toBe('2026-10-07T12:00:00.000Z')
  })

  it('includes overlapping spans, respects exclusive ends and uses the viewer time zone', () => {
    const text = calendar([
      entry('span', 'DTSTART;VALUE=DATE:20260929\nDTEND;VALUE=DATE:20261003'),
      entry('ends-before', 'DTSTART;VALUE=DATE:20260929\nDTEND;VALUE=DATE:20261001'),
      entry('local-october', 'DTSTART:20260930T230000Z'),
      entry('local-november', 'DTSTART:20261031T230000Z'),
      entry('floating', 'DTSTART:20261031T233000'),
    ])
    expect(previewCalendarRange(text, october).events.map((event) => event.title)).toEqual([
      'span',
      'local-october',
      'floating',
    ])
  })

  it('respects RDATE, monthly BYDAY rules and finite recurrence counts', () => {
    const text = calendar([
      entry(
        'extra',
        'DTSTART;VALUE=DATE:20260901\nRDATE;VALUE=DATE:20261003,20261010\nEXDATE;VALUE=DATE:20261003',
      ),
      entry('monthly', 'DTSTART;VALUE=DATE:20260907\nRRULE:FREQ=MONTHLY;BYDAY=1MO;COUNT=2'),
    ])
    expect(previewCalendarRange(text, october).events.map((event) => event.start)).toEqual([
      '2026-10-05',
      '2026-10-10',
    ])
    expect(
      previewCalendarRange(text, { ...october, from: '2026-11-01', to: '2026-12-01' }).events,
    ).toEqual([])
  })

  it('applies THISANDFUTURE shifts to occurrences originally outside the month', () => {
    const text = calendar([
      entry('series', 'DTSTART:20261028T120000Z\nRRULE:FREQ=DAILY;COUNT=10'),
      entry(
        'series',
        'RECURRENCE-ID;RANGE=THISANDFUTURE:20261030T120000Z\nDTSTART:20261001T120000Z',
      ),
    ])
    expect(
      previewCalendarRange(text, october).events.map((event) => event.start?.slice(0, 10)),
    ).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-28',
      '2026-10-29',
    ])
  })

  it('bounds an infinite high-frequency rule and explicitly reports an incomplete preview', () => {
    const text = calendar([entry('dense', 'DTSTART:20261001T000000Z\nRRULE:FREQ=MINUTELY')])
    const preview = previewCalendarRange(text, october)
    expect(preview.limited).toBe(true)
    expect(preview.events).toHaveLength(10_000)
    expect(
      previewCalendarRange(text.replace('FREQ=MINUTELY', 'FREQ=MINUTELY;COUNT=10000'), october)
        .limited,
    ).toBe(false)
  })
})

describe('iCalendar preservation and source identity', () => {
  it('renames recurring entries and exceptions without changing identities or cached source text', () => {
    const rule: TitleRule = {
      id: 'football',
      name: 'Football',
      enabled: true,
      caseSensitive: false,
      match: [{ kind: 'text', value: 'Fotboll' }],
      show: [{ kind: 'text', value: 'Matchdag' }],
    }
    const original = input()
    const previous = previewCalendar(mergeCalendars('Before', [original]))
    const formatted = {
      ...original,
      titleFormatting: { ...titleFormattingFromPrefix('⚽'), after: '!', rules: [rule] },
    }
    const events = previewCalendar(mergeCalendars('After', [formatted]))
    expect(events.map((event) => event.uid)).toEqual(previous.map((event) => event.uid))
    expect(events[0]?.title).toBe('⚽ Matchdag!')
    expect(events.map(({ title: _title, ...metadata }) => metadata)).toEqual(
      previous.map(({ title: _title, ...metadata }) => metadata),
    )
    expect(events.find((event) => event.exception)?.title).toBe('⚽ Later football!')
    expect(original.snapshot).toBe(fixture)
  })
  it('retains recurrence, moved exceptions, all-day spans, time zones, cancellation and rich properties', () => {
    const output = parseCalendar(mergeCalendars('Our week', [input()]))
    const events = output.getAllSubcomponents('vevent')
    expect(events).toHaveLength(4)
    const master = events[0]!
    const exception = events[1]!
    const timezone = output.getFirstSubcomponent('vtimezone')!
    expect(master.getFirstPropertyValue('uid')).toBe(exception.getFirstPropertyValue('uid'))
    expect(master.getFirstProperty('dtstart')?.getParameter('tzid')).toBe(
      timezone.getFirstPropertyValue('tzid'),
    )
    expect(exception.getFirstProperty('recurrence-id')?.getParameter('tzid')).toBe(
      timezone.getFirstPropertyValue('tzid'),
    )
    const event = new ICAL.Event(master)
    expect(event.startDate.toJSDate().toISOString()).toBe('2026-10-07T16:00:00.000Z')
    const moved = new ICAL.Event(exception)
    expect(moved.recurrenceId?.toJSDate().toISOString()).toBe('2026-10-14T16:00:00.000Z')
    expect(moved.startDate.toJSDate().toISOString()).toBe('2026-10-14T17:00:00.000Z')
    expect(master.getFirstPropertyValue('summary')).toBe('⚽ Fotboll')
    expect(master.getFirstPropertyValue('description')).toContain('boots')
    expect(master.getFirstPropertyValue('url')).toBe('https://example.test/event')
    expect(master.getFirstPropertyValue('organizer')).toBe('mailto:coach@example.test')
    expect(master.getFirstPropertyValue('x-team')).toBe('Blue')
    expect(master.getAllSubcomponents('valarm')).toHaveLength(1)
    expect(master.getFirstPropertyValue('rrule')).toBeDefined()
    expect(master.getFirstPropertyValue('exdate')).toBeDefined()
    expect(events[2]?.getFirstPropertyValue('status')).toBe('CANCELLED')
    expect(new ICAL.Event(events[3]!).startDate.isDate).toBe(true)
    expect(events[3]?.getFirstPropertyValue('dtend')?.toString()).toBe('2026-10-12')
  })
  it('previews IANA zones without VTIMEZONE and preserves floating local times', () => {
    const noTimezone = fixture.replace(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE\n/, '')
    const preview = previewCalendar(mergeCalendars('IANA', [input('iana', noTimezone)]))
    expect(preview.find((event) => event.title === '⚽ Fotboll')?.start).toBe(
      '2026-10-07T16:00:00.000Z',
    )
    const floating = noTimezone.replaceAll(';TZID=Europe/Stockholm', '')
    expect(
      previewCalendar(mergeCalendars('Local', [input('local', floating)])).find(
        (event) => event.title === '⚽ Fotboll',
      )?.start,
    ).toBe('2026-10-07T18:00:00')
  })
  it('keeps source identities stable across title, date and prefix changes and separates overlapping sources', () => {
    const first = previewCalendar(mergeCalendars('A', [input()]))
    const changed = previewCalendar(
      mergeCalendars('B', [
        input('source-a', fixture.replace('SUMMARY:Fotboll', 'SUMMARY:New title'), '👟'),
      ]),
    )
    expect(first.map((event) => event.uid)).toEqual(changed.map((event) => event.uid))
    const combined = parseCalendar(mergeCalendars('Together', [input(), input('source-b')]))
    expect(combined.getAllSubcomponents('vevent')).toHaveLength(8)
    expect(
      new Set(
        combined.getAllSubcomponents('vevent').map((event) => event.getFirstPropertyValue('uid')),
      ).size,
    ).toBe(4)
    expect(combined.getAllSubcomponents('vtimezone')).toHaveLength(2)
  })
  it('preserves empty calendars, replaces repeated revisions within a source and turns cancellation methods into status', () => {
    const empty = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:fixture\r\nEND:VCALENDAR'
    expect(previewCalendar(mergeCalendars('Empty', [input('a', empty)]))).toEqual([])
    const event =
      'BEGIN:VEVENT\nUID:same\nDTSTAMP:20261001T100000Z\nDTSTART:20261007T180000Z\nSUMMARY:Old\nSEQUENCE:1\nEND:VEVENT'
    const duplicate = `BEGIN:VCALENDAR\nVERSION:2.0\nMETHOD:CANCEL\n${event}\n${event.replace('Old', 'New').replace('SEQUENCE:1', 'SEQUENCE:2')}\nEND:VCALENDAR`
    const output = previewCalendar(mergeCalendars('Revisions', [input('a', duplicate)]))
    expect(output).toHaveLength(1)
    expect(output[0]?.title).toBe('⚽ New')
    expect(output[0]?.cancelled).toBe(true)
  })
  it('redacts the upstream subscription and its credential without removing normal event links', () => {
    const source = input()
    source.snapshot = fixture
      .replace('X-TEAM:Blue', `X-TEAM:Blue\nX-SOURCE:${source.url}\nATTACH:${source.url}`)
      .replace('Bring water', 'super-private-token Bring water')
    const output = mergeCalendars('Private', [source])
    expect(output).not.toContain('super-private-token')
    expect(output).not.toContain('abcdefghijklmnopqrstuvwx')
    expect(output).toContain('https://example.test/event')
  })
  it.each([
    'not a calendar',
    'BEGIN:VCALENDAR\nVERSION:1.0\nEND:VCALENDAR',
    'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Missing identity\nEND:VEVENT\nEND:VCALENDAR',
  ])('rejects invalid upstream data safely', (text) => {
    expect(() => parseCalendar(text)).toThrow('valid iCalendar')
  })
})
