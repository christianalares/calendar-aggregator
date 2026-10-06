import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { callerEnvironment, capture, childExit } from '../railway/process'

async function freePort() {
  const server = createServer()
  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a test port.'))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env, stdio: 'inherit' })
  const stop = () => child.kill('SIGTERM')
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    return await childExit(child)
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

const browser = process.argv[2] === 'browser'
const directory = await mkdtemp('/tmp/calendar-tests-')
let started = false
try {
  const port = await freePort()
  const appPort = await freePort()
  await capture(
    'initdb',
    [
      '-D',
      join(directory, 'pg'),
      '-U',
      'calendar_test',
      '--auth=trust',
      '--encoding=UTF8',
      '--no-locale',
    ],
    process.env,
    'Install PostgreSQL tools (initdb, pg_ctl, createdb) to run the isolated database tests.',
  )
  await capture(
    'pg_ctl',
    [
      '-D',
      join(directory, 'pg'),
      '-l',
      join(directory, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${port} -k ${directory}`,
      '-w',
      'start',
    ],
    process.env,
    'Could not start the isolated test database.',
  )
  started = true
  await capture(
    'createdb',
    ['-h', '127.0.0.1', '-p', String(port), '-U', 'calendar_test', 'calendar_aggregator_test'],
    process.env,
    'Could not create the isolated test database.',
  )
  const env = {
    ...process.env,
    ...callerEnvironment,
    TEST_DATABASE_URL: `postgres://calendar_test@127.0.0.1:${port}/calendar_aggregator_test`,
    DATABASE_URL: `postgres://calendar_test@127.0.0.1:${port}/calendar_aggregator_test`,
    BETTER_AUTH_SECRET: 'fixture-only-auth-secret-at-least-32-characters',
    APP_URL: `http://localhost:${appPort}`,
    NODE_ENV: browser ? 'production' : 'test',
    PORT: String(appPort),
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    OPERATOR_GOOGLE_EMAIL: '',
  }
  const migrated = await run('pnpm', ['--filter', '@calendar-aggregator/db', 'migrate'], env)
  if (migrated !== 0) {
    throw new Error('Test database migration failed.')
  }
  if (browser && (await run('pnpm', ['build'], env)) !== 0) {
    throw new Error('Browser fixture build failed.')
  }
  process.exitCode = await run(
    'pnpm',
    [
      'exec',
      browser ? 'playwright' : 'vitest',
      ...(browser ? ['test'] : ['run']),
      ...process.argv.slice(browser ? 3 : 2),
    ],
    env,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Test setup failed.')
  process.exitCode = 1
} finally {
  if (started) {
    await capture(
      'pg_ctl',
      ['-D', join(directory, 'pg'), '-m', 'immediate', '-w', 'stop'],
      process.env,
      'Could not stop the fixture database.',
    )
  }
  await rm(directory, { recursive: true, force: true })
}
