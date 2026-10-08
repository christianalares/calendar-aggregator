import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { destinations } from '../apps/browser-fetch/policy.ts'
import { createBrowserServer } from '../apps/browser-fetch/server.ts'
import { createSourceFetcher } from '../apps/web/src/server/browser-fetch'

const calendar = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'
const connection = { url: 'http://browser.railway.internal:3000', secret: 'x'.repeat(64) }
const publicDNS = async () => [{ address: '93.184.216.34', family: 4 }]

describe('optional browser fallback', () => {
  it('uses the normal connection first and never relays unselected failures', async () => {
    const request = vi.fn()
    const direct = vi.fn(async () => calendar)
    const fetch = createSourceFetcher(connection, direct, request)
    expect(await fetch('https://ligaspel.se/feed', { useBrowser: true })).toBe(calendar)
    expect(request).not.toHaveBeenCalled()
    direct.mockRejectedValueOnce(new Error('403'))
    await expect(fetch('https://ligaspel.se/feed', { useBrowser: false })).rejects.toThrow('403')
    expect(request).not.toHaveBeenCalled()
  })
  it('authenticates the selected fallback and rejects verification HTML', async () => {
    const direct = vi.fn(async () => {
      throw new Error('403')
    })
    const request = vi.fn<typeof globalThis.fetch>(async () => new Response(calendar))
    const fetch = createSourceFetcher(connection, direct, request)
    expect(await fetch('https://ligaspel.se/feed?token=private', { useBrowser: true })).toBe(
      calendar,
    )
    expect(String(request.mock.calls[0]?.[0])).toBe('http://browser.railway.internal:3000/fetch')
    expect((request.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${connection.secret}`,
    )
    request.mockResolvedValueOnce(new Response('<html>Verify</html>'))
    await expect(fetch('https://ligaspel.se/feed', { useBrowser: true })).rejects.toThrow(
      'verification page',
    )
  })
  it('bounds returned data and hides service diagnostics and URLs', async () => {
    const direct = async () => {
      throw new Error('403')
    }
    const request = vi.fn(async () => new Response('secret-token', { status: 502 }))
    const fetch = createSourceFetcher(connection, direct, request)
    await expect(fetch('https://ligaspel.se/feed', { useBrowser: true })).rejects.toThrow(
      'could not fetch',
    )
    request.mockResolvedValueOnce(new Response('x'.repeat(5 * 1024 * 1024 + 1)))
    await expect(fetch('https://ligaspel.se/feed', { useBrowser: true })).rejects.toThrow(
      'too large',
    )
    await expect(
      createSourceFetcher({}, direct)('https://ligaspel.se/feed', { useBrowser: true }),
    ).rejects.toThrow('not configured')
  })
})

describe('browser network boundary', () => {
  it.each([
    'http://ligaspel.se/feed',
    'https://user:secret@ligaspel.se/feed',
    'https://ligaspel.se:8443/feed',
    'https://127.0.0.1/feed',
    'https://web.railway.internal/feed',
  ])('rejects %s before lookup', async (url) => {
    const resolve = vi.fn(publicDNS)
    await expect(destinations(url, ['ligaspel.se'], resolve)).rejects.toThrow()
    expect(resolve).not.toHaveBeenCalled()
  })
  it('blocks mixed DNS, pins both permitted hosts and denies other requests', async () => {
    await expect(
      destinations('https://ligaspel.se/feed', ['ligaspel.se'], async () => [
        ...(await publicDNS()),
        { address: '10.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow('Blocked')
    const policy = await destinations('https://ligaspel.se/feed', ['ligaspel.se'], publicDNS)
    expect(policy.resolverRules).toContain('MAP ligaspel.se 93.184.216.34')
    expect(policy.resolverRules).toContain('MAP challenges.cloudflare.com 93.184.216.34')
    expect(policy.resolverRules).toContain('MAP * ~NOTFOUND')
    expect(policy.permits('https://challenges.cloudflare.com/check')).toBe(true)
    expect(policy.permits('https://ligaspel.se/redirect')).toBe(true)
    expect(policy.permits('https://169.254.169.254/latest')).toBe(false)
    expect(policy.permits('https://example.com')).toBe(false)
    expect(policy.permits('file:///etc/passwd')).toBe(false)
  })
})

describe('private browser API', () => {
  it('requires authentication, limits concurrency and returns calendar data', async () => {
    let finish!: (text: string) => void
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const browser = vi.fn(() => {
      started()
      return new Promise<string>((resolve) => {
        finish = resolve
      })
    })
    const server = createBrowserServer({
      secret: connection.secret,
      hosts: ['ligaspel.se'],
      fetch: browser,
      validate: (url, hosts) => destinations(url, hosts, publicDNS),
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    try {
      expect((await fetch(`${base}/health`)).status).toBe(200)
      expect((await fetch(`${base}/fetch`, { method: 'POST', body: '{}' })).status).toBe(401)
      expect(browser).not.toHaveBeenCalled()
      const options = {
        method: 'POST',
        headers: { Authorization: `Bearer ${connection.secret}` },
        body: JSON.stringify({ url: 'https://ligaspel.se/feed' }),
      }
      const first = fetch(`${base}/fetch`, options)
      await ready
      expect((await fetch(`${base}/fetch`, options)).status).toBe(429)
      finish(calendar)
      const result = await first
      expect(result.status).toBe(200)
      expect(await result.text()).toBe(calendar)
      browser.mockRejectedValueOnce(new Error('private-token'))
      expect(await (await fetch(`${base}/fetch`, options)).text()).not.toContain('private-token')
      expect(
        (
          await fetch(`${base}/fetch`, {
            ...options,
            body: JSON.stringify({ url: 'https://web.railway.internal' }),
          })
        ).status,
      ).toBe(422)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
