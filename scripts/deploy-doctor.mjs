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
  const sessionSecret = process.env.SESSION_SECRET?.trim() || ''
  const encryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET?.trim() || ''
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim() || ''
  const nwcUrl = process.env.LAP_LIGHTNING_RECEIVER_NWC_URL?.trim() || ''
  const codexSession = process.env.LAP_CODEX_AUTH_SESSION_JSON?.trim() || ''
  
  let hasFailure = false

  console.log('LAP deploy doctor')
  console.log(`Env cargado: ${loadedFiles.length > 0 ? loadedFiles.join(', ') : 'ninguno'}`)

  // 1. DATABASE_URL
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

  // 2. LLM Provider
  if (!cloudProvider) {
    hasFailure = true
    logStatus(false, 'LLM cloud', 'falta OPENAI_API_KEY u OPENROUTER_API_KEY para preview o produccion')
  } else {
    logStatus(true, 'LLM cloud', `${cloudProvider} configurado`)
  }

  // 3. Auth & Security
  if (!sessionSecret) {
    hasFailure = true
    logStatus(false, 'SESSION_SECRET', 'falta SESSION_SECRET (obligatorio para Auth.js)')
  } else {
    logStatus(true, 'SESSION_SECRET', 'configurado')
  }

  if (!encryptionSecret) {
    hasFailure = true
    logStatus(false, 'API_KEY_ENCRYPTION_SECRET', 'falta secreto para encriptar API keys en DB')
  } else {
    logStatus(true, 'API_KEY_ENCRYPTION_SECRET', 'configurado')
  }

  if (!nextAuthUrl) {
    console.log('WARN NEXTAUTH_URL: no configurado. Auth.js v5 suele requerirlo en produccion.')
  } else {
    logStatus(true, 'NEXTAUTH_URL', 'configurado')
  }

  // 4. Features (NWC & Codex)
  if (!nwcUrl) {
    console.log('WARN NWC: LAP_LIGHTNING_RECEIVER_NWC_URL no configurado. Los cobros Lightning no funcionaran.')
  } else {
    logStatus(true, 'Lightning (NWC)', 'configurado')
  }

  if (!codexSession) {
    console.log('INFO Codex: LAP_CODEX_AUTH_SESSION_JSON no configurado. Modo servicio Codex desactivado.')
  } else {
    logStatus(true, 'Codex Session', 'configurado')
  }

  // 5. Next.js Routes configuration
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
