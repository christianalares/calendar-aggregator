import { createHash } from 'node:crypto'
import { type EventFilterRule, matchEventFilter } from '@calendar-aggregator/db/event-filters'
import {
  formatTitle,
  type TitleFormatting,
  titleFormattingFromPrefix,
} from '@calendar-aggregator/db/title-formatting'
import ICAL from 'ical.js'

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

function previewStart(start: ICAL.Time | undefined, component: ICAL.Component) {
  if (!start) {
    return null
  }
  if (start.isDate) {
    return start.toString()
  }

  if (start.zone.tzid !== 'floating') {
    return start.toJSDate().toISOString()
  }
  const tzid = component.getFirstProperty('dtstart')?.getParameter('tzid')

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

function previewEvent(component: ICAL.Component) {
  const event = new ICAL.Event(component)
  const start = event.startDate

  return {
    uid: event.uid,
    title: event.summary ?? 'Untitled event',
    start: previewStart(start, component),
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
    .map(previewEvent)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
    .slice(0, 40)
}
