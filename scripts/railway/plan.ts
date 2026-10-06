import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { productionTarget } from '../../.railway/targets'
import { callerEnvironment, childExit } from './process'

await mkdir('.railway-plans', { recursive: true, mode: 0o700 })
const child = spawn('railway', ['config', 'plan', '--out', '.railway-plans/production.json'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...callerEnvironment,
    RAILWAY_PROJECT_ID: productionTarget.projectId,
    RAILWAY_ENVIRONMENT_ID: productionTarget.environmentId,
  },
})
process.exitCode = await childExit(child)
