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

function isTruthyFlag(value) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function resolveDevArgs(rawArgs, env) {
  let codexMode = isTruthyFlag(env.npm_config_codex)
  const nextArgs = []

  for (const arg of rawArgs) {
    if (arg === '--codex' || arg === '-codex') {
      codexMode = true
      continue
    }

    nextArgs.push(arg)
  }

  return {
    codexMode,
    nextArgs,
  }
}

const nextBin = require.resolve('next/dist/bin/next')
const env = { ...process.env }
const { codexMode, nextArgs } = command === 'dev'
  ? resolveDevArgs(args, env)
  : { codexMode: false, nextArgs: args }

if (codexMode) {
  env.LAP_CODEX_DEV_MODE = '1'
  env.NEXT_PUBLIC_LAP_CODEX_DEV_MODE = '1'
}

if (command === 'build' || command === 'start') {
  const isVercel = env.VERCEL === '1' || env.NODE_ENV === 'production'
  env.NEXT_DIST_DIR = isVercel ? '.next' : '.next-build'
}

const child = spawn(process.execPath, [nextBin, command, ...nextArgs], {
  stdio: 'inherit',
  env,
})

function syncRouteTypes() {
  const distDir = env.NEXT_DIST_DIR || '.next'
  const buildRoutesPath = path.join(projectRoot, distDir, 'types', 'routes.d.ts')
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
  const updated = current.replace(new RegExp(`\\.\\/${distDir}\\/types\\/routes\\.d\\.ts`, 'g'), './.next/types/routes.d.ts')

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
