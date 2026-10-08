import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type BrowserContext, chromium } from 'patchright'
import { BrowserFetchError, destinations, limits } from './policy.ts'

export async function fetchWithBrowser(rawURL: string, allowedHosts: string[]) {
  const target = await destinations(rawURL, allowedHosts)
  const profile = await mkdtemp(path.join(tmpdir(), 'calpal-browser-'))
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      headless: false,
      viewport: null,
      acceptDownloads: true,
      serviceWorkers: 'block',
      args: [
        `--host-resolver-rules=${target.resolverRules}`,
        '--disable-quic',
        '--disable-background-networking',
      ],
      timeout: 15_000,
    })
    await context.route('**/*', (route) =>
      target.permits(route.request().url()) ? route.continue() : route.abort(),
    )
    await context.routeWebSocket('**/*', (socket) => socket.close())
    const page = context.pages()[0] || (await context.newPage())
    let text: string | undefined
    let tooLarge = false
    const accept = (value: string) => {
      if (Buffer.byteLength(value) > limits.bytes) {
        tooLarge = true
        return
      }
      if (value.trimStart().startsWith('BEGIN:VCALENDAR')) text = value
    }
    page.on('download', async (download) => {
      try {
        const file = await download.path()
        if (!file) return
        if ((await stat(file)).size > limits.bytes) {
          tooLarge = true
          return
        }
        accept(await readFile(file, 'utf8'))
      } catch {}
    })
    page.on('response', async (response) => {
      try {
        if (
          !response.request().isNavigationRequest() ||
          response.frame() !== page.mainFrame() ||
          !response.ok()
        )
          return
        const headers = await response.allHeaders()
        if (headers['cf-mitigated'] === 'challenge') return
        if (Number(headers['content-length']) > limits.bytes) {
          tooLarge = true
          return
        }
        if (
          /text\/(calendar|plain)|application\/(octet-stream|ics)/i.test(
            headers['content-type'] || '',
          )
        ) {
          accept(await response.text())
        }
      } catch {}
    })
    const deadline = Date.now() + limits.timeoutMs
    try {
      await page.goto(target.url.href, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    } catch {}
    let clicks = 0
    let lastClick = 0
    while (!text && !tooLarge && Date.now() < deadline) {
      for (const frame of page.frames()) {
        if (!frame.url().startsWith('https://challenges.cloudflare.com/')) continue
        const checkbox = frame.getByRole('checkbox').first()
        if (
          clicks < 3 &&
          Date.now() - lastClick > 5000 &&
          (await checkbox.isVisible().catch(() => false)) &&
          !(await checkbox.isChecked().catch(() => true))
        ) {
          try {
            await checkbox.click({ timeout: 2000 })
            clicks++
            lastClick = Date.now()
          } catch {}
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (tooLarge) throw new BrowserFetchError('Calendar data exceeds the size limit.')
    if (!text)
      throw new BrowserFetchError(
        'The provider did not return calendar data before the browser deadline.',
      )
    return text
  } finally {
    await context?.close().catch(() => {})
    await rm(profile, { recursive: true, force: true })
  }
}
