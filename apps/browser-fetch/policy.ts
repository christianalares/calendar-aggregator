import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

export const limits = { bytes: 5 * 1024 * 1024, timeoutMs: 45_000, jobMs: 55_000 }
export class BrowserFetchError extends Error {}

export async function destinations(
  raw: string,
  allowedHosts: string[],
  resolve: (host: string) => Promise<{ address: string; family: number }[]> = (host) =>
    lookup(host, { all: true }),
) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BrowserFetchError('Invalid calendar URL.')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new BrowserFetchError(
      'Browser fetching requires an HTTPS calendar URL on the default port.',
    )
  }
  if (!allowedHosts.includes(url.hostname)) {
    throw new BrowserFetchError('Browser fetching is not enabled for this provider.')
  }
  const hosts = [...new Set([url.hostname, 'challenges.cloudflare.com'])]
  const mappings = await Promise.all(
    hosts.map(async (hostname) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let addresses: { address: string; family: number }[]
      try {
        addresses = await Promise.race([
          resolve(hostname),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new BrowserFetchError('DNS lookup timed out.')), 5000)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
      if (
        !addresses.length ||
        addresses.some(({ address }) => {
          try {
            return ipaddr.process(address).range() !== 'unicast'
          } catch {
            return true
          }
        })
      )
        throw new BrowserFetchError('Blocked network destination.')
      const address = addresses.find((a) => a.family === 4)?.address
      if (!address) throw new BrowserFetchError('This provider needs a public IPv4 address.')
      return { hostname, address }
    }),
  )
  return {
    url,
    // Pin all browser DNS to checked public addresses, including subresource requests.
    resolverRules: [
      ...mappings.map(({ hostname, address }) => `MAP ${hostname} ${address}`),
      'MAP * ~NOTFOUND',
    ].join(', '),
    permits(rawURL: string) {
      try {
        const target = new URL(rawURL)
        return (
          target.protocol === 'https:' &&
          !target.port &&
          !target.username &&
          !target.password &&
          hosts.includes(target.hostname)
        )
      } catch {
        return false
      }
    },
  }
}
