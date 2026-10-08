import { fetchWithBrowser } from './browser.ts'

process.once('message', async ({ url, hosts }: { url: string; hosts: string[] }) => {
  try {
    const text = await fetchWithBrowser(url, hosts)
    process.send?.({ text })
  } catch {
    process.send?.({ error: 'Browser fetch failed.' })
  } finally {
    process.disconnect()
  }
})
