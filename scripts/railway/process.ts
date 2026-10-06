import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const callerEnvironment = {
  RAILWAY_CALLER: 'skill:use-railway@1.6.1',
  RAILWAY_AGENT_SESSION: process.env.RAILWAY_AGENT_SESSION ?? `calendar-${randomUUID()}`,
}

export function capture(command: string, args: string[], env: NodeJS.ProcessEnv, message: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timeout = setTimeout(() => child.kill(), 30_000)
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    // Provider diagnostics may contain variables or URLs. Surface only a safe error.
    child.stderr.resume()
    child.once('error', () => {
      clearTimeout(timeout)
      reject(new Error(message))
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      code === 0 ? resolve(output) : reject(new Error(message))
    })
  })
}

export function childExit(child: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    child.once('error', () => reject(new Error('Could not start the requested process.')))
    child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 0 : 1)))
  })
}

export async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  const stopped = childExit(child).catch(() => 1)
  child.kill('SIGTERM')
  const deadline = setTimeout(() => child.kill('SIGKILL'), 3000)
  await stopped
  clearTimeout(deadline)
}
