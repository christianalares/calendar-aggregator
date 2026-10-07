import { readFileSync } from 'node:fs'
import ICAL from 'ical.js'
import { describe, expect, it } from 'vitest'
import { mergeCalendars, parseCalendar, previewCalendar } from '../apps/web/src/server/ical'
import { type TitleRule, titleFormattingFromPrefix } from '../packages/db/src/title-formatting'

const fixture = readFileSync(new URL('./fixtures/complex.ics', import.meta.url), 'utf8')
const input = (id = 'source-a', snapshot = fixture, prefix = '⚽') => ({
  id,
  snapshot,
  prefix,
  url: 'https://provider.test/private/abcdefghijklmnopqrstuvwx?token=super-private-token',
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
