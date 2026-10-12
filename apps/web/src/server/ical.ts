import { createHash } from 'node:crypto'
import { type EventFilterRule, matchEventFilter } from '@calendar-aggregator/db/event-filters'
import {
  formatTitle,
  type TitleFormatting,
  titleFormattingFromPrefix,
} from '@calendar-aggregator/db/title-formatting'
import ICAL from 'ical.js'
import type { PreviewRange } from '../lib/calendar-inputs'

export class CalendarParseError extends Error {}

export function parseCalendar(text: string) {
  try {
    const calendar = new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/, '')))

    if (calendar.name !== 'vcalendar' || calendar.getFirstPropertyValue('version') !== '2.0') {
      throw new Error('Invalid calendar envelope.')
    }

    for (const event of calendar.getAllSubcomponents('vevent')) {
      if (!event.getFirstPropertyValue('uid') || !event.getFirstPropertyValue('dtstamp')) {
        throw new Error('Missing event identity or timestamp.')
      }

      // Force typed properties to decode while still inside the parse boundary.
      for (const property of event.getAllProperties()) {
        property.getValues()
      }
    }

    return calendar
  } catch {
    throw new CalendarParseError(
      'The provider did not return a valid iCalendar feed. Check the subscription URL.',
    )
  }
}

function identity(sourceId: string, value: string) {
  return `${createHash('sha256').update(`${sourceId}\0${value}`).digest('hex')}@calendar-aggregator`
}

function redact(text: string, sourceURL: string) {
  const url = new URL(sourceURL)
  let result = text
    .replaceAll(sourceURL, '[private subscription]')
    .replaceAll(url.href, '[private subscription]')

  for (const [key, value] of url.searchParams) {
    if (value.length >= 8 || /token|key|secret|password|auth/i.test(key)) {
      result = result.replaceAll(value, '[private subscription]')
    }
  }

  for (const segment of url.pathname.split('/').filter((part) => part.length >= 16)) {
    result = result.replaceAll(segment, '[private subscription]')
  }

  return result
}

function sanitizeComponent(component: ICAL.Component, sourceURL: string) {
  for (const property of component.getAllProperties()) {
    const parameters: Record<string, unknown> = property.toJSON()[1]

    for (const [name, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        property.setParameter(name, redact(value, sourceURL))
      } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        property.setParameter(
          name,
          value.map((item: string) => redact(item, sourceURL)),
        )
      }
    }

    // Identity references are hashed during publication, so retain them together.
    if (['uid', 'related-to'].includes(property.name)) {
      continue
    }

    const values = property
      .getValues()
      .map((value) => (typeof value === 'string' ? redact(value, sourceURL) : value))

    if (
      property.type === 'uri' &&
      values.some((value) => typeof value === 'string' && value.includes('[private subscription]'))
    ) {
      component.removeProperty(property)
    } else if (property.isMultiValue) {
      property.setValues(values)
    } else if (values[0] !== undefined) {
      property.setValue(values[0])
    }
  }

  for (const child of component.getAllSubcomponents()) {
    sanitizeComponent(child, sourceURL)
  }
}

export function sanitizeCalendar(text: string, sourceURL: string) {
  const calendar = parseCalendar(text)
  sanitizeComponent(calendar, sourceURL)

  return calendar.toString()
}

function latestEvents(calendar: ICAL.Component) {
  const events = new Map<string, ICAL.Component>()
  for (const original of calendar.getAllSubcomponents('vevent')) {
    const key = `${original.getFirstPropertyValue('uid')}\0${original.getFirstProperty('recurrence-id')?.toICALString() ?? ''}`
    const previous = events.get(key)
    const sequence = Number(original.getFirstPropertyValue('sequence') ?? 0)
    const previousSequence = Number(previous?.getFirstPropertyValue('sequence') ?? 0)
    if (!previous || sequence >= previousSequence) events.set(key, original)
  }
  return [...events.values()]
}

function eventText(component: ICAL.Component) {
  return {
    title: String(component.getFirstPropertyValue('summary') ?? ''),
    description: String(component.getFirstPropertyValue('description') ?? ''),
    location: String(component.getFirstPropertyValue('location') ?? ''),
  }
}

function excludedEvents(events: ICAL.Component[], rules: EventFilterRule[]) {
  const excluded = new Map<string, { rule: EventFilterRule; title: string }>()
  for (const event of events) {
    const text = eventText(event)
    const rule = matchEventFilter(text, rules)
    const uid = String(event.getFirstPropertyValue('uid'))
    // Remove masters and exceptions together, so an exception cannot reintroduce a series.
    if (rule && !excluded.has(uid)) excluded.set(uid, { rule, title: text.title })
  }
  return excluded
}

export function previewEventFilters(text: string, rules: EventFilterRule[]) {
  const events = latestEvents(parseCalendar(text))
  const excluded = excludedEvents(events, rules)
  const filtered = events.filter((event) =>
    excluded.has(String(event.getFirstPropertyValue('uid'))),
  )
  return {
    total: events.length,
    excludedCount: filtered.length,
    keptCount: events.length - filtered.length,
    events: filtered
      .map((component) => {
        const directMatch = matchEventFilter(eventText(component), rules)
        const reason = directMatch
          ? { rule: directMatch, title: eventText(component).title }
          : excluded.get(String(component.getFirstPropertyValue('uid')))
        if (!reason) throw new Error('Missing exclusion reason.')
        return {
          ...previewEvent(component),
          description: eventText(component).description.slice(0, 500),
          rule: reason.rule,
          matchedTitle: reason.title,
          seriesMatch: !directMatch,
        }
      })
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
      .slice(0, 40),
  }
}

/** Preview the same original-text filtering and title pipeline used by subscriptions. */
export function previewCustomization(
  text: string,
  rules: EventFilterRule[],
  titleFormatting: TitleFormatting,
  view: 'all' | 'changed' | 'excluded' = 'all',
) {
  const components = latestEvents(parseCalendar(text))
  const excluded = excludedEvents(components, rules)
  const events = components.map((component) => {
    const original = previewEvent(component)
    const originalTitle = eventText(component).title
    const directMatch = matchEventFilter(eventText(component), rules)
    const reason = directMatch
      ? { rule: directMatch, title: originalTitle }
      : excluded.get(original.uid)
    const formatted = formatTitle(originalTitle, titleFormatting)
    return {
      ...original,
      originalTitle,
      title: reason ? originalTitle : formatted.title,
      renamedBy: reason ? null : (formatted.matchedRule?.name ?? null),
      exclusion: reason
        ? {
            rule: reason.rule,
            matchedTitle: reason.title,
            seriesMatch: !directMatch,
          }
        : null,
    }
  })
  const excludedCount = events.filter((event) => event.exclusion).length
  const changedCount = events.filter(
    (event) => !event.exclusion && event.title !== event.originalTitle,
  ).length
  const visible = events.filter((event) =>
    view === 'excluded'
      ? event.exclusion
      : view === 'changed'
        ? !event.exclusion && event.title !== event.originalTitle
        : true,
  )
  return {
    total: events.length,
    excludedCount,
    keptCount: events.length - excludedCount,
    changedCount,
    visibleCount: visible.length,
    events: visible.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')).slice(0, 40),
  }
}

export function mergeCalendars(
  name: string,
  snapshots: {
    id: string
    url: string
    prefix: string
    snapshot: string
    titleFormatting?: TitleFormatting | null
    eventFilters?: EventFilterRule[]
  }[],
) {
  const output = new ICAL.Component(['vcalendar', [], []])
  output.addPropertyWithValue('version', '2.0')
  output.addPropertyWithValue('prodid', '-//Calendar Aggregator//Read-only subscriptions//EN')
  output.addPropertyWithValue('calscale', 'GREGORIAN')
  output.addPropertyWithValue('x-wr-calname', name)
  output.addPropertyWithValue('name', name)

  for (const source of snapshots) {
    const input = parseCalendar(source.snapshot)
    const timezones = new Map<string, string>()

    for (const original of input.getAllSubcomponents('vtimezone')) {
      const timezone = new ICAL.Component(structuredClone(original.toJSON()))
      const oldId = timezone.getFirstPropertyValue('tzid')

      if (typeof oldId === 'string') {
        const newId = identity(source.id, `timezone:${oldId}`)
        timezones.set(oldId, newId)
        timezone.updatePropertyWithValue('tzid', newId)
        sanitizeComponent(timezone, source.url)
        output.addSubcomponent(timezone)
      }
    }

    const events = latestEvents(input)
    const excluded = excludedEvents(events, source.eventFilters ?? [])

    for (const original of events) {
      if (excluded.has(String(original.getFirstPropertyValue('uid')))) continue
      const event = new ICAL.Component(structuredClone(original.toJSON()))
      const uid = event.getFirstPropertyValue('uid')
      event.updatePropertyWithValue('uid', identity(source.id, String(uid)))
      const title = event.getFirstPropertyValue('summary')

      const formatted = formatTitle(
        typeof title === 'string' ? title : '',
        source.titleFormatting ?? titleFormattingFromPrefix(source.prefix),
      ).title
      if (typeof title === 'string' || formatted) {
        event.updatePropertyWithValue('summary', formatted)
      }

      if (input.getFirstPropertyValue('method') === 'CANCEL') {
        event.updatePropertyWithValue('status', 'CANCELLED')
      }

      function rewrite(component: ICAL.Component) {
        for (const property of component.getAllProperties()) {
          const tzid = property.getParameter('tzid')

          if (typeof tzid === 'string' && timezones.has(tzid)) {
            const replacement = timezones.get(tzid)

            if (replacement) {
              property.setParameter('tzid', replacement)
            }
          }

          if (property.name === 'related-to') {
            property.setValue(identity(source.id, String(property.getFirstValue())))
          }
        }

        for (const child of component.getAllSubcomponents()) {
          rewrite(child)
        }
      }

      sanitizeComponent(event, source.url)
      rewrite(event)
      output.addSubcomponent(event)
    }
  }

  return output.toString()
}

function previewStart(
  start: ICAL.Time | undefined,
  component: ICAL.Component,
  property = 'dtstart',
) {
  if (!start) {
    return null
  }
  if (start.isDate) {
    return start.toString()
  }

  if (start.zone.tzid !== 'floating') {
    return start.toJSDate().toISOString()
  }
  const tzid = (
    component.getFirstProperty(property) ?? component.getFirstProperty('dtstart')
  )?.getParameter('tzid')

  if (typeof tzid === 'string') {
    try {
      // Some providers use an IANA TZID without embedding VTIMEZONE. Preserve
      // that TZID in the feed and use the runtime's IANA database for preview.
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tzid,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
      const wall = Date.UTC(
        start.year,
        start.month - 1,
        start.day,
        start.hour,
        start.minute,
        start.second,
      )
      let instant = wall

      for (let attempt = 0; attempt < 3; attempt++) {
        const parts = Object.fromEntries(
          formatter.formatToParts(instant).map((part) => [part.type, part.value]),
        )
        const shown = Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day),
          Number(parts.hour),
          Number(parts.minute),
          Number(parts.second),
        )
        instant += wall - shown
      }

      return new Date(instant).toISOString()
    } catch {
      /* Unknown custom TZIDs have no usable offset; display wall time. */
    }
  }

  return start.toString()
}

function previewEvent(
  component: ICAL.Component,
  occurrence?: { startDate: ICAL.Time; endDate: ICAL.Time },
) {
  const event = new ICAL.Event(component, { exceptions: [] })
  const start = occurrence?.startDate ?? event.startDate

  return {
    uid: event.uid,
    title: event.summary ?? 'Untitled event',
    start: previewStart(start, component),
    end: start ? previewStart(occurrence?.endDate ?? event.endDate, component, 'dtend') : null,
    allDay: start?.isDate ?? false,
    recurring: event.isRecurring(),
    exception: Boolean(event.recurrenceId),
    cancelled: component.getFirstPropertyValue('status') === 'CANCELLED',
    location: String(component.getFirstPropertyValue('location') ?? ''),
  }
}

export function previewCalendar(text: string) {
  return parseCalendar(text)
    .getAllSubcomponents('vevent')
    .map((component) => previewEvent(component))
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
}

/** Expand only the visible month, retaining exceptions and the published feed's rules. */
export function previewCalendarRange(text: string, range: PreviewRange) {
  const components = latestEvents(parseCalendar(text))
  const exceptions = new Map<string, ICAL.Component[]>()
  for (const component of components) {
    const recurrenceId = component.getFirstPropertyValue('recurrence-id') as ICAL.Time | null
    if (!recurrenceId) continue
    // Cancellation exceptions may provide only RECURRENCE-ID, without DTSTART.
    if (!component.hasProperty('dtstart')) component.addPropertyWithValue('dtstart', recurrenceId)
    const uid = String(component.getFirstPropertyValue('uid'))
    const related = exceptions.get(uid) ?? []
    related.push(component)
    exceptions.set(uid, related)
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: range.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  function day(value: string) {
    if (!/(Z|[+-]\d\d:\d\d)$/.test(value)) return value.slice(0, 10)
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
    )
    return `${parts.year}-${parts.month}-${parts.day}`
  }
  function lastDay(event: ReturnType<typeof previewEvent>) {
    if (!event.start || !event.end || event.end <= event.start)
      return event.start ? day(event.start) : null
    // DTEND is exclusive, including all-day events and midnight endings.
    const floating = !/(Z|[+-]\d\d:\d\d)$/.test(event.end)
    const end = floating ? `${event.end}${event.end.length === 10 ? 'T00:00:00' : ''}Z` : event.end
    const last = new Date(Date.parse(end) - 1).toISOString()
    return floating ? last.slice(0, 10) : day(last)
  }

  const events: ReturnType<typeof previewEvent>[] = []
  const seen = new Set<string>()
  let limited = false
  let iterations = 0
  function include(
    event: ReturnType<typeof previewEvent>,
    recurrenceId?: string | null,
    expanded = false,
  ) {
    if (event.start && (day(event.start) >= range.to || (lastDay(event) ?? '') < range.from)) return
    const key = `${event.uid}\0${recurrenceId ?? event.start}`
    if (seen.has(key)) return
    if (expanded && events.length >= 10_000) {
      limited = true
      return
    }
    seen.add(key)
    events.push(event)
  }

  // Detached and moved exceptions must be considered even when their original
  // occurrence falls outside the requested month or appears in EXDATE.
  for (const component of components) {
    if (!component.hasProperty('rrule') && !component.hasProperty('rdate')) {
      const recurrenceId = component.getFirstPropertyValue('recurrence-id') as ICAL.Time | null
      include(
        previewEvent(component),
        recurrenceId ? previewStart(recurrenceId, component, 'recurrence-id') : null,
      )
    }
  }
  for (const component of components) {
    if (component.hasProperty('recurrence-id')) continue
    const event = new ICAL.Event(component, {
      exceptions: exceptions.get(String(component.getFirstPropertyValue('uid'))) ?? [],
    })
    if (!event.isRecurring() || event.isRecurrenceException() || !event.startDate) continue
    // Allow shifted THISANDFUTURE occurrences and time-zone boundary crossings.
    const backwardShift = Math.max(
      0,
      ...(exceptions.get(event.uid) ?? []).map((exception) => {
        const changed = new ICAL.Event(exception, { exceptions: [] })
        return changed.modifiesFuture()
          ? -changed.startDate.subtractDate(changed.recurrenceId).toSeconds() * 1000
          : 0
      }),
    )
    const stop = Date.parse(range.to) + backwardShift + 2 * 86_400_000
    const iterator = event.iterator()
    while (true) {
      const next = iterator.next()
      if (!next || next.toJSDate().getTime() >= stop) break
      // Infinite or extremely dense rules must not monopolize a request. Report
      // any safety limit to the user instead of silently omitting occurrences.
      if (++iterations > 100_000) {
        limited = true
        break
      }
      const details = event.getOccurrenceDetails(next)
      include(
        { ...previewEvent(details.item.component, details), recurring: true },
        previewStart(next, component),
        true,
      )
      if (limited) break
    }
    if (limited) break
  }
  return {
    events: events.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
    limited,
  }
}
