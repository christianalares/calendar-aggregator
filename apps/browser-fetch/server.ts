import { fork } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { BrowserFetchError, destinations, limits } from './policy.ts'

export function runJob(url: string, hosts: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = fork(new URL('./job.ts', import.meta.url), {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      detached: true,
    })
    let finished = false
    const stop = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {}
    }
    const timer = setTimeout(() => {
      finished = true
      stop()
      reject(new BrowserFetchError('Browser fetch timed out.'))
    }, limits.jobMs)
    child.once('message', (result: { text?: string; error?: string }) => {
      finished = true
      clearTimeout(timer)
      stop()
      result.text ? resolve(result.text) : reject(new BrowserFetchError('Browser fetch failed.'))
    })
    child.once('error', () => {
      clearTimeout(timer)
      stop()
      reject(new BrowserFetchError('Could not start browser.'))
    })
    child.once('exit', () => {
      if (!finished) {
        clearTimeout(timer)
        reject(new BrowserFetchError('Browser stopped.'))
      }
    })
    child.send({ url, hosts })
  })
}

export function createBrowserServer({
  secret,
  hosts,
  fetch = runJob,
  validate = destinations,
}: {
  secret: string
  hosts: string[]
  fetch?: (url: string, hosts: string[]) => Promise<string>
  validate?: typeof destinations
}) {
  let busy = false
  return http.createServer(async (request, response) => {
    const reply = (status: number, body: unknown) => {
      if (response.destroyed || response.writableEnded) return
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      response.end(JSON.stringify(body))
    }
    if (request.method === 'GET' && ['/', '/health'].includes(request.url ?? '')) {
      reply(200, { status: 'ok' })
      return
    }
    const actual = Buffer.from(request.headers.authorization || '')
    const expected = Buffer.from(`Bearer ${secret}`)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      reply(401, { error: 'Unauthorized.' })
      return
    }
    if (request.method !== 'POST' || request.url !== '/fetch') {
      reply(404, { error: 'Not found.' })
      return
    }
    if (busy) {
      reply(429, { error: 'Browser busy.' })
      return
    }
    busy = true
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 8192) {
          reply(413, { error: 'Request too large.' })
          return
        }
        chunks.push(chunk)
      }
      let url: unknown
      try {
        url = JSON.parse(Buffer.concat(chunks).toString()).url
      } catch {
        reply(400, { error: 'Invalid request.' })
        return
      }
      if (typeof url !== 'string' || url.length > 4096) {
        reply(400, { error: 'Invalid calendar URL.' })
        return
      }
      try {
        await validate(url, hosts)
      } catch {
        reply(422, { error: 'Unsupported browser destination.' })
        return
      }
      const text = await fetch(url, hosts)
      if (Buffer.byteLength(text) > limits.bytes || !text.trimStart().startsWith('BEGIN:VCALENDAR'))
        throw new BrowserFetchError('Invalid calendar response.')
      response.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(text)
    } catch {
      reply(502, { error: 'Browser could not retrieve calendar data.' })
    } finally {
      busy = false
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.BROWSER_FETCH_SECRET
  if (!secret || secret.length < 32)
    throw new Error('Configure BROWSER_FETCH_SECRET with at least 32 characters.')
  const hosts = (process.env.BROWSER_FETCH_ALLOWED_HOSTS || 'ligaspel.se')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const server = createBrowserServer({ secret, hosts })
  server.requestTimeout = 10_000
  server.headersTimeout = 10_000
  server.listen(Number(process.env.PORT || 3000), '::')
}
