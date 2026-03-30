import { existsSync, readFileSync } from 'node:fs'

const PLACEHOLDER_DATABASE_URL = /:\/\/user:password@host(?::\d+)?\//i
const LOCAL_DATABASE_URL = /:\/\/(?:[^@]+@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i
const REQUIRED_LONG_ROUTES = [
  'app/api/plan/build/route.ts',
  'app/api/plan/simulate/route.ts'
]

function loadDeployEnv() {
  const loadedFiles = []

  for (const envFile of ['.env.production.local', '.env.local', '.env']) {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile)
      loadedFiles.push(envFile)
    }
  }

  return loadedFiles
}

function logStatus(ok, label, detail) {
  const prefix = ok ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${label}${detail ? `: ${detail}` : ''}`)
}

function hasRouteMaxDuration(routePath) {
  if (!existsSync(routePath)) {
    return false
  }

  const source = readFileSync(routePath, 'utf8')
  return /export const maxDuration\s*=\s*60/.test(source)
}

function hasVercelTimeoutConfig() {
  if (!existsSync('vercel.json')) {
    return false
  }

  const source = readFileSync('vercel.json', 'utf8')
  return REQUIRED_LONG_ROUTES.every((routePath) => source.includes(routePath) && source.includes('"maxDuration": 60'))
}

function isCloudDatabaseUrl(value) {
  return Boolean(value) &&
    !PLACEHOLDER_DATABASE_URL.test(value) &&
    !LOCAL_DATABASE_URL.test(value)
}

function getConfiguredCloudProvider() {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return 'OpenRouter'
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return 'OpenAI'
  }

  return ''
}

async function main() {
  const loadedFiles = loadDeployEnv()
  const databaseUrl = process.env.DATABASE_URL?.trim() || ''
  const cloudProvider = getConfiguredCloudProvider()
  let hasFailure = false

  console.log('LAP deploy doctor')
  console.log(`Env cargado: ${loadedFiles.length > 0 ? loadedFiles.join(', ') : 'ninguno'}`)

  if (!databaseUrl) {
    hasFailure = true
    logStatus(false, 'DATABASE_URL', 'falta configurar una base cloud para Vercel')
  } else if (PLACEHOLDER_DATABASE_URL.test(databaseUrl)) {
    hasFailure = true
    logStatus(false, 'DATABASE_URL', 'sigue apuntando al placeholder de .env.example')
  } else if (LOCAL_DATABASE_URL.test(databaseUrl)) {
    hasFailure = true
    logStatus(false, 'DATABASE_URL', 'apunta a localhost; Vercel necesita PostgreSQL cloud')
  } else {
    logStatus(true, 'DATABASE_URL', 'parece apuntar a una base cloud')
  }

  if (!cloudProvider) {
    hasFailure = true
    logStatus(false, 'LLM cloud', 'falta OPENAI_API_KEY u OPENROUTER_API_KEY para preview o produccion')
  } else {
    logStatus(true, 'LLM cloud', `${cloudProvider} configurado`)
  }

  const routeTimeoutsOk = REQUIRED_LONG_ROUTES.every(hasRouteMaxDuration)
  if (routeTimeoutsOk) {
    logStatus(true, 'maxDuration', 'las rutas largas exportan maxDuration=60')
  } else {
    hasFailure = true
    logStatus(false, 'maxDuration', 'falta export const maxDuration = 60 en alguna ruta larga')
  }

  if (hasVercelTimeoutConfig()) {
    logStatus(true, 'vercel.json', 'timeouts largos declarados para build y simulate')
  } else {
    hasFailure = true
    logStatus(false, 'vercel.json', 'faltan timeouts largos para build y simulate')
  }

  if (hasFailure) {
    process.exitCode = 1
    console.log('Resultado: todavia faltan precondiciones para Vercel.')
    return
  }

  console.log('Resultado: el repo tiene precondiciones razonables para un smoke en Vercel.')
}

await main()
