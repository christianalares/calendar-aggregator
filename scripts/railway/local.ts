import { type ChildProcess, spawn } from 'node:child_process'
import { createConnection, createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { productionTarget } from '../../.railway/targets'
import { connectDatabase } from '../../packages/db/src/index'
import { writeSchema } from './generate-env'
import { localEnvironment, privateDatabaseURL, validateTarget, variableMap } from './local-config'
import { callerEnvironment, capture, childExit, stopChild } from './process'

const root = fileURLToPath(new URL('../../', import.meta.url))
const cli = `${root}node_modules/.bin/railway`
const environment = { ...process.env, ...callerEnvironment }
const children = new Set<ChildProcess>()
const controller = new AbortController()

async function variables(service: 'web' | 'postgres') {
  const raw = await capture(
    cli,
    [
      'variable',
      'list',
      '--json',
      '--project',
      productionTarget.projectId,
      '--environment',
      productionTarget.environmentId,
      '--service',
      service,
    ],
    environment,
    'Could not load Railway variables. Check railway login and access to the selected service.',
  )

  try {
    const values = variableMap.parse(JSON.parse(raw))
    validateTarget(values, service)

    return values
  } catch {
    throw new Error('Railway returned invalid or unexpected service configuration.')
  }
}

async function freePort() {
  const server = createServer()
  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a tunnel port.'))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

async function listening(port: number) {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (ready: boolean) => {
      socket.destroy()
      resolve(ready)
    }
    socket.setTimeout(200)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function tunnelDatabase(rawURL?: string) {
  const original = privateDatabaseURL(rawURL)
  const dbVariables = await variables('postgres')
  const serviceId = validateTarget(dbVariables, 'postgres')
  if (privateDatabaseURL(dbVariables.DATABASE_URL).href !== original.href) {
    throw new Error('The application DATABASE_URL does not match the selected PostgreSQL service.')
  }
  const config = await capture(
    cli,
    [
      'ssh',
      'config',
      '--dry-run',
      '--project',
      productionTarget.projectId,
      '--environment',
      productionTarget.environmentId,
      '--service',
      serviceId,
    ],
    environment,
    'Could not resolve the private Railway SSH target.',
  )
  const user = config.match(/^\s*User ([a-f\d-]{36})\s*$/m)?.[1]
  if (
    !user ||
    !/^\s*HostName ssh\.railway\.com\s*$/m.test(config) ||
    !config.includes(
      `railway:${productionTarget.projectId}:${productionTarget.environmentId}:${dbVariables.RAILWAY_SERVICE_ID}`,
    )
  ) {
    throw new Error('Railway returned an unexpected SSH target.')
  }
  const port = await freePort()
  const child = spawn(
    'ssh',
    [
      '-F',
      '/dev/null',
      ...(process.env.CALENDAR_SSH_IDENTITY
        ? ['-i', process.env.CALENDAR_SSH_IDENTITY, '-o', 'IdentitiesOnly=yes']
        : []),
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ServerAliveInterval=10',
      '-o',
      'ServerAliveCountMax=2',
      '-N',
      '-L',
      `127.0.0.1:${port}:127.0.0.1:5432`,
      `${user}@ssh.railway.com`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  children.add(child)
  child.stderr?.resume()
  let exited = false
  void childExit(child)
    .then(() => {
      exited = true
      controller.abort()
    })
    .catch(() => {
      exited = true
      controller.abort()
    })
  const deadline = Date.now() + 15_000
  while (!(await listening(port))) {
    if (exited || Date.now() > deadline || controller.signal.aborted) {
      throw new Error(
        'The private database tunnel could not start. Check your Railway SSH key and known host.',
      )
    }
    await delay(100)
  }
  const local = new URL(original)
  local.hostname = '127.0.0.1'
  local.port = String(port)
  const connection = connectDatabase(local.href)
  try {
    const result = await connection.db.execute<{ name: string }>(
      'select current_database() as name',
    )
    if (result[0]?.name !== decodeURIComponent(original.pathname.slice(1))) {
      throw new Error()
    }
  } catch {
    throw new Error('Could not authenticate to the selected database through the private tunnel.')
  } finally {
    await connection.close()
  }

  return local.href
}

async function run() {
  const [command, flag, target, ...rest] = process.argv.slice(2)
  if (
    !['dev', 'env', 'migrate'].includes(command ?? '') ||
    flag !== '--environment' ||
    target !== 'production' ||
    rest.length
  ) {
    throw new Error(
      'Use pnpm dev, env:generate or db:migrate --environment production. This explicitly selects the shared production database.',
    )
  }
  const remote = await variables('web')
  await writeSchema(Object.keys(remote))
  if (command === 'env') {
    console.info('Generated the server schema from Railway variable names only.')
    return 0
  }
  const local = localEnvironment(remote, process.env)
  local.DATABASE_URL = await tunnelDatabase(remote.DATABASE_URL)
  controller.signal.throwIfAborted()
  console.info(
    `web: production configuration loaded in memory; private PostgreSQL connection verified. Starting ${command}.`,
  )
  const child =
    command === 'dev'
      ? spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'dev'], {
          cwd: `${root}apps/web`,
          env: local,
          stdio: 'inherit',
        })
      : spawn(process.execPath, ['./node_modules/tsx/dist/cli.mjs', 'packages/db/src/migrate.ts'], {
          cwd: root,
          env: local,
          stdio: 'inherit',
        })
  children.add(child)
  controller.signal.addEventListener(
    'abort',
    () => {
      void stopChild(child)
    },
    { once: true },
  )

  return await childExit(child)
}

const stop = () => {
  controller.abort()
  for (const child of children) {
    void stopChild(child)
  }
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
try {
  process.exitCode = await run()
} catch (error) {
  console.error(
    error instanceof Error && error.name === 'Error' ? error.message : 'Local startup stopped.',
  )
  process.exitCode = 1
} finally {
  await Promise.all([...children].map(stopChild))
  process.off('SIGINT', stop)
  process.off('SIGTERM', stop)
}
