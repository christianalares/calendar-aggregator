import http from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  type FetchTransport,
  fetchCalendar,
  isPublicAddress,
  pinnedTransport,
} from '../apps/web/src/server/upstream'

const publicDNS = async () => [{ address: '93.184.216.34', family: 4 }]
async function* body(text = 'calendar') {
  yield Buffer.from(text)
}

describe('the production fetch policy', () => {
  it.each([
    '127.0.0.1',
    '0.0.0.0',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })
  it('accepts public addresses and rejects mixed DNS responses before transport', async () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
    const transport = vi.fn()
    await expect(
      fetchCalendar('https://provider.test/feed', {
        resolve: async () => [...(await publicDNS()), { address: '10.0.0.1', family: 4 }],
        transport,
      }),
    ).rejects.toThrow('blocked')
    expect(transport).not.toHaveBeenCalled()
  })
  it.each([
    'file:///etc/passwd',
    'ftp://provider.test/feed',
    'http://user:password@provider.test/feed',
    'http://[::1]/feed',
  ])('rejects unsupported destination %s', async (url) => {
    await expect(fetchCalendar(url, { resolve: publicDNS })).rejects.toThrow()
  })
  it('checks a redirect destination before connecting and resolves only once per hop', async () => {
    const resolve = vi.fn(publicDNS)
    const transport = vi.fn<FetchTransport>(async () => ({
      status: 302,
      location: 'http://169.254.169.254/latest',
      body: body(),
    }))
    await expect(
      fetchCalendar('https://provider.test/feed', { resolve, transport }),
    ).rejects.toThrow('blocked')
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[1]).toEqual({ address: '93.184.216.34', family: 4 })
  })
  it('enforces redirect and body-size limits and reports safe provider errors', async () => {
    const transport = vi.fn<FetchTransport>(async () => ({
      status: 302,
      location: '/again',
      body: body(),
    }))
    await expect(
      fetchCalendar('https://provider.test/feed?token=private-secret', {
        resolve: publicDNS,
        transport,
      }),
    ).rejects.toThrow('too many')
    expect(transport).toHaveBeenCalledTimes(4)
    await expect(
      fetchCalendar('https://provider.test/feed', {
        resolve: publicDNS,
        maxBytes: 4,
        transport: async () => ({ status: 200, body: body('too large') }),
      }),
    ).rejects.toThrow('large')
    await expect(
      fetchCalendar('https://provider.test/feed?token=private-secret', {
        resolve: publicDNS,
        transport: async () => ({ status: 401, body: body() }),
      }),
    ).rejects.toThrow('HTTP 401')
  })
  it('bounds a stalled DNS lookup and a stalled response body', async () => {
    await expect(
      fetchCalendar('https://provider.test/feed', {
        timeoutMs: 15,
        resolve: () => new Promise(() => {}),
      }),
    ).rejects.toThrow('too long')
    await expect(
      fetchCalendar('https://provider.test/feed', {
        timeoutMs: 15,
        resolve: publicDNS,
        transport: async () => ({
          status: 200,
          body: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) },
        }),
      }),
    ).rejects.toThrow('too long')
  })
  it.each([200, 403, 503])(
    'reports browser challenges for HTTP %s without reading private HTML',
    async (status) => {
      const release = vi.fn(async () => ({ done: true as const, value: undefined }))
      const read = vi.fn(async () => ({ done: false as const, value: Buffer.from('private HTML') }))
      await expect(
        fetchCalendar('https://provider.test/feed?token=private-secret', {
          resolve: publicDNS,
          transport: async () => ({
            status,
            browserChallenge: true,
            body: { [Symbol.asyncIterator]: () => ({ next: read, return: release }) },
          }),
        }),
      ).rejects.toThrow('Cloudflare protection requires a browser check')
      expect(read).not.toHaveBeenCalled()
      expect(release).toHaveBeenCalledOnce()
    },
  )
  it('connects to the pinned address while preserving the HTTP host', async () => {
    const server = http.createServer((request, response) => {
      response.setHeader('cf-mitigated', 'challenge')
      response.end(request.headers.host)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing fixture port')
    }
    try {
      // Exercise the transport itself; the policy tests above still reject loopback input.
      const response = await pinnedTransport(
        new URL(`http://provider.test:${address.port}/feed`),
        { address: '127.0.0.1', family: 4 },
        new AbortController().signal,
      )
      expect(response.browserChallenge).toBe(true)
      let text = ''
      for await (const chunk of response.body) {
        text += Buffer.from(chunk).toString()
      }
      expect(text).toBe(`provider.test:${address.port}`)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
