import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import ipaddr from 'ipaddr.js'

export const fetchLimits = { timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024, redirects: 3 }

export class FetchError extends Error {}

export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === 'unicast'
  } catch {
    return false
  }
}

export type ResolvedAddress = { address: string; family: number }
export type FetchTransport = (
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
) => Promise<{ status: number; location?: string; body: AsyncIterable<Uint8Array> }>

export const pinnedTransport: FetchTransport = (url, address, signal) => {
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? https.request : http.request
    // Connect to the validated IP itself. Host and TLS identity stay bound to
    // the original hostname; the network layer cannot perform a second lookup.
    const outgoing = request(
      {
        protocol: url.protocol,
        hostname: address.address,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        signal,
        servername: url.hostname.replace(/^\[|\]$/g, ''),
        headers: {
          Host: url.host,
          Accept: 'text/calendar, text/plain;q=0.8',
          'Accept-Encoding': 'identity',
          'User-Agent': 'CalendarAggregator/1.0',
        },
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 0,
          location: response.headers.location,
          body: response,
        })
      },
    )
    outgoing.once('error', () =>
      reject(new FetchError('Could not connect to the calendar provider.')),
    )
    outgoing.end()
  })
}

export async function fetchCalendar(
  rawURL: string,
  options: {
    resolve?: (hostname: string) => Promise<ResolvedAddress[]>
    transport?: FetchTransport
    timeoutMs?: number
    maxBytes?: number
  } = {},
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? fetchLimits.timeoutMs)
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(new FetchError('The calendar provider took too long to respond.')),
      { once: true },
    )
  })

  async function run() {
    let url: URL

    try {
      url = new URL(rawURL)
    } catch {
      throw new FetchError('Enter a valid calendar subscription URL.')
    }

    for (let redirect = 0; redirect <= fetchLimits.redirects; redirect++) {
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new FetchError(
          'Use an HTTP or HTTPS subscription URL without embedded login credentials.',
        )
      }

      const hostname = url.hostname.replace(/^\[|\]$/g, '')
      const addresses = ipaddr.isValid(hostname)
        ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }]
        : await (options.resolve ?? ((host) => lookup(host, { all: true })))(hostname)

      if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address))) {
        throw new FetchError('This calendar URL resolves to a blocked network address.')
      }

      const address = addresses[0]

      if (!address) {
        throw new FetchError('The calendar provider could not be resolved.')
      }

      const response = await (options.transport ?? pinnedTransport)(url, address, controller.signal)

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        // End the current body/socket before following a different destination.
        const iterator = response.body[Symbol.asyncIterator]()
        await iterator.return?.()

        if (!response.location || redirect === fetchLimits.redirects) {
          throw new FetchError('The calendar provider redirected too many times.')
        }

        url = new URL(response.location, url)
        continue
      }

      if (response.status < 200 || response.status >= 300) {
        const iterator = response.body[Symbol.asyncIterator]()
        await iterator.return?.()
        throw new FetchError(
          `The calendar provider returned HTTP ${response.status}. Check that the subscription is still active.`,
        )
      }

      let size = 0
      const chunks: Uint8Array[] = []

      for await (const chunk of response.body) {
        size += chunk.byteLength

        if (size > (options.maxBytes ?? fetchLimits.maxBytes)) {
          throw new FetchError('The calendar feed is too large to fetch safely.')
        }

        chunks.push(chunk)
      }

      return Buffer.concat(chunks).toString('utf8')
    }

    throw new FetchError('The calendar could not be fetched.')
  }

  try {
    return await Promise.race([run(), aborted])
  } catch (error) {
    throw error instanceof FetchError
      ? error
      : new FetchError('Could not read this calendar. Check the subscription URL and try again.')
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}
