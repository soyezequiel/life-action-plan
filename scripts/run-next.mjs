import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(scriptPath), '..')

const [, , command, ...args] = process.argv

if (!command) {
  console.error('Missing Next.js command.')
  process.exit(1)
}

const nextBin = require.resolve('next/dist/bin/next')
const env = { ...process.env }

if (command === 'build' || command === 'start') {
  env.NEXT_DIST_DIR = '.next-build'
}

const child = spawn(process.execPath, [nextBin, command, ...args], {
  stdio: 'inherit',
  env,
})

function syncRouteTypes() {
  const buildRoutesPath = path.join(projectRoot, '.next-build', 'types', 'routes.d.ts')
  const devTypesDir = path.join(projectRoot, '.next', 'types')
  const devRoutesPath = path.join(devTypesDir, 'routes.d.ts')
  const nextEnvPath = path.join(projectRoot, 'next-env.d.ts')

  if (fs.existsSync(buildRoutesPath)) {
    fs.mkdirSync(devTypesDir, { recursive: true })
    fs.copyFileSync(buildRoutesPath, devRoutesPath)
  }

  if (!fs.existsSync(nextEnvPath)) {
    return
  }

  const current = fs.readFileSync(nextEnvPath, 'utf8')
  const updated = current.replace('./.next-build/types/routes.d.ts', './.next/types/routes.d.ts')

  if (updated !== current) {
    fs.writeFileSync(nextEnvPath, updated, 'utf8')
  }
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  if ((code ?? 0) === 0 && command === 'build') {
    syncRouteTypes()
  }

  process.exit(code ?? 0)
})
