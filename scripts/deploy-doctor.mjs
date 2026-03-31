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
  // We accept 60 or 120 (Next.js 15+ long running routes)
  return /export const maxDuration\s*=\s*(?:60|120)/.test(source)
}

function hasVercelTimeoutConfig() {
  if (!existsSync('vercel.json')) {
    return false
  }

  const source = readFileSync('vercel.json', 'utf8')
  // Ensure the route is mentioned and has a reasonable timeout configured
  return REQUIRED_LONG_ROUTES.every((routePath) => 
    source.includes(routePath) && (source.includes('"maxDuration": 60') || source.includes('"maxDuration": 120'))
  )
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
    logStatus(true, 'maxDuration', 'las rutas largas exportan maxDuration >= 60')
  } else {
    hasFailure = true
    logStatus(false, 'maxDuration', 'falta export const maxDuration = 60/120 en alguna ruta larga')
  }

  if (hasVercelTimeoutConfig()) {
    logStatus(true, 'vercel.json', 'timeouts largos declarados para build y simulate')
  } else {
    hasFailure = true
    logStatus(false, 'vercel.json', 'faltan timeouts largos (60/120) para build y simulate')
  }

  if (hasFailure) {
    process.exitCode = 1
    console.log('\n❌ Resultado: todavia faltan precondiciones para Vercel.')
    return
  }

  console.log('\n✅ Resultado: el repo tiene precondiciones razonables para un smoke en Vercel.')
}

await main()
