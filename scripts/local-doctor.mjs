import { existsSync } from 'node:fs'
import postgres from 'postgres'

const REQUIRED_TABLES = [
  'profiles',
  'plans',
  'plan_progress',
  'settings',
  'user_settings',
  'analytics_events',
  'cost_tracking',
  'operation_charges'
]

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const PLACEHOLDER_DATABASE_URL = /:\/\/user:password@host(?::\d+)?\//i

function loadLocalEnv() {
  const loadedFiles = []

  for (const envFile of ['.env.local', '.env']) {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile)
      loadedFiles.push(envFile)
    }
  }

  return loadedFiles
}

function normalizeOllamaBaseUrl(rawValue) {
  const trimmed = (rawValue || DEFAULT_OLLAMA_BASE_URL).trim().replace(/\/+$/g, '')
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed
}

function needsSsl(connectionString) {
  return connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
}

function logStatus(ok, label, detail) {
  const prefix = ok ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${label}${detail ? `: ${detail}` : ''}`)
}

function logNote(label, detail) {
  console.log(`INFO ${label}${detail ? `: ${detail}` : ''}`)
}

async function checkDatabase(connectionString) {
  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    prepare: false,
    ssl: needsSsl(connectionString) ? 'require' : undefined
  })

  try {
    await sql`select 1`
    const rows = await sql`
      select tablename
      from pg_tables
      where schemaname = 'public'
    `
    const foundTables = new Set(rows.map((row) => row.tablename))
    const missingTables = REQUIRED_TABLES.filter((tableName) => !foundTables.has(tableName))

    return {
      ok: missingTables.length === 0,
      missingTables
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function getResourceSmokeReadiness(connectionString) {
  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    prepare: false,
    ssl: needsSsl(connectionString) ? 'require' : undefined
  })

  try {
    const [backendCredentialRow] = await sql`
      select count(*)::int as count
      from credential_registry
      where owner = 'backend'
        and status = 'active'
        and secret_type = 'api-key'
        and provider_id in ('openai', 'openrouter')
    `
    const [userCredentialRow] = await sql`
      select count(*)::int as count
      from credential_registry
      where owner = 'user'
        and status = 'active'
        and secret_type = 'api-key'
        and provider_id in ('openai', 'openrouter')
    `
    const [walletRow] = await sql`
      select count(*)::int as count
      from user_settings
      where key like 'wallet-%' or key like 'wallet.%'
    `

    return {
      backendCredentialCount: backendCredentialRow.count,
      userCredentialCount: userCredentialRow.count,
      walletCount: walletRow.count
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function checkOllama(baseUrl) {
  const response = await fetch(`${baseUrl}/api/tags`)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = await response.json()
  const models = Array.isArray(payload.models)
    ? payload.models
      .map((model) => (typeof model?.name === 'string' ? model.name : ''))
      .filter(Boolean)
    : []

  return models
}

async function main() {
  const loadedFiles = loadLocalEnv()
  const skipOllama = process.argv.includes('--skip-ollama')
  const requireCharge = process.argv.includes('--require-charge')
  const databaseUrl = process.env.DATABASE_URL?.trim() || ''
  const ollamaBaseUrl = normalizeOllamaBaseUrl(process.env.OLLAMA_BASE_URL)
  const lightningReceiverUrl = process.env.LAP_LIGHTNING_RECEIVER_NWC_URL?.trim() || ''
  const configuredChargeSats = process.env.LAP_PLAN_BUILD_CHARGE_SATS?.trim() || ''
  let hasFailure = false

  console.log('LAP local doctor')
  console.log(`Env cargado: ${loadedFiles.length > 0 ? loadedFiles.join(', ') : 'ninguno'}`)

  if (!databaseUrl) {
    hasFailure = true
    logStatus(false, 'DATABASE_URL', 'falta configurar DATABASE_URL en .env.local o .env')
  } else if (PLACEHOLDER_DATABASE_URL.test(databaseUrl)) {
    hasFailure = true
    logStatus(false, 'DATABASE_URL', 'sigue apuntando al placeholder de .env.example')
  } else {
    logStatus(true, 'DATABASE_URL', 'configurado')
    let databaseReady = false

    try {
      const databaseCheck = await checkDatabase(databaseUrl)
      if (databaseCheck.ok) {
        logStatus(true, 'PostgreSQL', 'conexion OK y tablas base presentes')
        databaseReady = true
      } else {
        hasFailure = true
        logStatus(false, 'PostgreSQL', `faltan tablas: ${databaseCheck.missingTables.join(', ')}`)
        console.log('Siguiente paso sugerido: npm run db:push')
      }
    } catch (error) {
      hasFailure = true
      const detail = error instanceof Error ? error.message : String(error)
      logStatus(false, 'PostgreSQL', detail)
    }

    if (databaseReady) {
      try {
        const readiness = await getResourceSmokeReadiness(databaseUrl)
        const hasBackendEnvCredential = Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim())
        const backendReady = readiness.backendCredentialCount > 0 || hasBackendEnvCredential
        const userReady = readiness.userCredentialCount > 0
        const walletReady = readiness.walletCount > 0

        logNote(
          'Smoke backend-cloud',
          backendReady
            ? `listo (${readiness.backendCredentialCount} credenciales backend activas${hasBackendEnvCredential ? ' + env detectado' : ''})`
            : 'falta credencial backend cloud activa en DB o OPENAI_API_KEY / OPENROUTER_API_KEY'
        )
        logNote(
          'Smoke user-cloud',
          userReady
            ? `listo (${readiness.userCredentialCount} credenciales user activas)`
            : 'falta credencial user cloud activa'
        )
        logNote(
          'Smoke wallet',
          walletReady
            ? `lista (${readiness.walletCount} conexiones guardadas)`
            : 'falta wallet-nwc guardada'
        )
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        logNote('Smoke readiness', `no se pudo relevar (${detail})`)
      }
    }
  }

  if (lightningReceiverUrl) {
    const chargeLabel = configuredChargeSats || '5 (default)'
    logStatus(true, 'Lightning receiver', `configurado para cobros reales (${chargeLabel} sats por build online)`)
  } else if (requireCharge) {
    hasFailure = true
    logStatus(false, 'Lightning receiver', 'falta LAP_LIGHTNING_RECEIVER_NWC_URL para ejecutar cobro Lightning real')
    console.log('Siguiente paso sugerido: configurar la wallet receptora del producto en .env.local.')
  } else {
    logNote('Lightning receiver', 'sin LAP_LIGHTNING_RECEIVER_NWC_URL; el smoke local solo valida build gratis/local y bloqueos de cobro')
  }

  if (skipOllama) {
    console.log('Ollama omitido por --skip-ollama')
  } else {
    try {
      const models = await checkOllama(ollamaBaseUrl)
      const modelSummary = models.length > 0 ? models.join(', ') : 'sin modelos listados'
      logStatus(true, 'Ollama', `${ollamaBaseUrl} (${modelSummary})`)
    } catch (error) {
      hasFailure = true
      const detail = error instanceof Error ? error.message : String(error)
      logStatus(false, 'Ollama', `${ollamaBaseUrl} (${detail})`)
      console.log('Siguiente paso sugerido: abrir Ollama o correr `ollama serve`.')
    }
  }

  if (hasFailure) {
    process.exitCode = 1
    console.log('Resultado: hay precondiciones locales pendientes.')
    return
  }

  console.log('Resultado: esta maquina esta lista para el smoke local.')
  console.log('Siguiente paso sugerido: npm run dev')
}

await main()
