import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export function renderSchema(names: string[]) {
  const properties = [...new Set(names)].sort().map((name) => {
    const optional = /^(RAILWAY_|RAILPACK_)/.test(name) ? '.optional()' : ''

    return `  ${JSON.stringify(name)}: z.string()${optional},`
  })

  return `// Generated from environment variable names; no values. Do not edit.\nimport { z } from 'zod'\n\nexport const envSchema = z.object({\n${properties.join('\n')}\n})\n`
}

export async function writeSchema(names: string[]) {
  const path = fileURLToPath(new URL('../../apps/web/src/env.generated.ts', import.meta.url))
  const content = renderSchema(names)

  await mkdir(fileURLToPath(new URL('../../apps/web/src', import.meta.url)), { recursive: true })

  if (
    (await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return ''
      }
      throw error
    })) !== content
  ) {
    await writeFile(path, content)
  }
}
